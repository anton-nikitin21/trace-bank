import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
import server
from fixtures import demo

class APITests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        server.DB=Path(cls.tmp.name)/"test.sqlite"
        cls.http=server.ThreadingHTTPServer(("127.0.0.1",0),server.Handler)
        server.PORT=cls.http.server_port
        cls.base=f"http://127.0.0.1:{server.PORT}"
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join();cls.tmp.cleanup()
    def request(self,path,data=None,headers=None):
        body=json.dumps(data).encode() if data is not None else None
        req=urllib.request.Request(self.base+path,data=body,headers={"Content-Type":"application/json",**(headers or {})})
        try:
            with urllib.request.urlopen(req,timeout=5) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:return e.code,json.load(e)
    def test_approval_and_immutable_revision(self):
        status,r=self.request('/api/analyze',demo())
        self.assertEqual(status,200)
        self.assertEqual(self.request('/api/approve',{'revision':r['revision'],'comment':'Проверено'})[0],409)
        status,fixed=self.request('/api/analyze',demo(True));self.assertEqual(status,200)
        status,approval=self.request('/api/approve',{'revision':fixed['revision'],'comment':'Проверен полный комплект'})
        self.assertEqual(status,200);self.assertEqual(approval['state'],'review_recorded')
        self.assertEqual(self.request('/api/revision/'+r['revision'])[1]['issue_count'],4)
    def test_cross_origin_and_invalid_packet(self):
        self.assertEqual(self.request('/api/analyze',demo(),{'Origin':'https://other.example'})[0],403)
        self.assertEqual(self.request('/api/analyze',{'profile':'unknown'})[0],400)
        self.assertEqual(self.request('/api/analyze',demo(),{'Content-Type':'text/plain'})[0],415)
    def test_history_and_missing_revision(self):
        status,r=self.request('/api/analyze',demo(True));self.assertEqual(status,200)
        history=self.request('/api/history')[1]
        self.assertTrue(any(h['id']==r['revision'] for h in history))
        self.assertEqual(self.request('/api/revision/missing')[0],404)

if __name__=='__main__':unittest.main()
