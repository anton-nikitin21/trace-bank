"""Exercise registry authorization, immutable versions and invalid input over HTTP."""
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import storage_server as storage

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        identities = {hashlib.sha256(k.encode()).hexdigest(): v for k, v in {
            'admin': {'user':'alice','organization':'org-a','role':'admin'},
            'editor': {'user':'bob','organization':'org-a','role':'editor'},
            'reader': {'user':'carol','organization':'org-a','role':'reader'},
            'other': {'user':'dave','organization':'org-b','role':'admin'},
        }.items()}
        self.db_patch = patch.object(storage, 'DB', Path(self.tmp.name)/'records.sqlite')
        self.id_patch = patch.object(storage, 'IDENTITIES', identities)
        self.db_patch.start(); self.id_patch.start()
        self.server = ThreadingHTTPServer(('127.0.0.1',0), storage.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.url = 'http://127.0.0.1:%s' % self.server.server_port
        self.body = dict(title='Договор',condition='Поставка',owner='Владелец',effective_date='2026-11-11',mandatory=True,status='draft')

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.db_patch.stop(); self.id_patch.stop(); self.tmp.cleanup()

    def request(self, method='GET', token='admin', data=None, key='test', path='/api/records'):
        request = Request(self.url+path, method=method, data=json.dumps(data).encode() if data is not None else None,
                          headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':key})
        try: response = urlopen(request)
        except HTTPError as error: response = error
        with response: return response.code, json.load(response)

    def save(self, version=0, **body):
        return dict(kind='requirements',object_id='req-1',expected_version=version,body={**self.body,**body})

    def test_roles_and_organization_isolation(self):
        self.assertEqual(self.request(token='',path='/api/session')[0],401)
        self.assertEqual(self.request('POST',token='reader',data=self.save())[0],403)
        self.assertEqual(self.request('POST',token='editor',data=self.save())[0],201)
        self.assertEqual(self.request(token='other')[1],[])
        self.assertEqual(len(self.request(token='reader')[1]),1)
        self.assertEqual(self.request('POST',token='editor',data=self.save(1,status='approved'),key='approve')[0],403)

    def test_approval_conflicts_replay_and_immutability(self):
        self.assertEqual(self.request('POST',data=self.save())[0],201)
        self.assertTrue(self.request('POST',data=self.save())[1]['replayed'])
        self.assertEqual(self.request('POST',data=self.save(title='Changed'))[0],409)
        self.assertEqual(self.request('POST',data=self.save(0),key='conflict')[0],409)
        self.assertEqual(self.request('POST',data=self.save(1,status='approved',title='Unsaved'),key='unsaved')[0],409)
        self.assertEqual(self.request('POST',data=self.save(1,status='approved'),key='approved')[0],201)
        records = self.request()[1]
        self.assertEqual([r['body']['status'] for r in records],['draft','approved'])
        self.assertEqual([r['version'] for r in records],[1,2])
        with storage.connect() as connection:
            with self.assertRaises(storage.sqlite3.IntegrityError): connection.execute('DELETE FROM records')

    def test_invalid_requests_return_400_without_disconnect(self):
        for i, data in enumerate([[], {'body':[]},
                {**self.save(),'expected_version':True}, self.save(effective_date='2026-02-30'), self.save(status='unknown')]):
            self.assertEqual(self.request('POST',data=data,key='bad'+str(i))[0],400)
        self.assertEqual(self.request('POST',data=self.save(),key='good')[0],201)

if __name__ == '__main__': unittest.main()
