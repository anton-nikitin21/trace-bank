import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
import clerk_session

class ClerkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537,key_size=2048)

    def verify(self, **overrides):
        now = int(time.time())
        claims = dict(iss=clerk_session.ISSUER, sub="user_1", sid="sess_1", azp=clerk_session.PARTIES[0],
                      exp=now+60, iat=now, nbf=now, o={"id":"org_1","rol":"admin"})
        claims.update(overrides)
        token = jwt.encode(claims,self.key,algorithm="RS256")
        with patch.object(clerk_session.keys,"get_signing_key_from_jwt",return_value=SimpleNamespace(key=self.key.public_key())):
            return clerk_session.verify(token)

    def test_valid(self):
        self.assertEqual(self.verify()["role"],"admin")

    def test_expired(self):
        with self.assertRaises(jwt.InvalidTokenError):
            self.verify(exp=int(time.time())-10)

    def test_wrong_origin(self):
        with self.assertRaises(jwt.InvalidTokenError):
            self.verify(azp="https://invalid.example")

    def test_wrong_issuer(self):
        with self.assertRaises(jwt.InvalidTokenError):
            self.verify(iss="https://invalid.example")

    def test_no_organization(self):
        with self.assertRaises(jwt.InvalidTokenError):
            self.verify(o={})

if __name__ == "__main__":
    unittest.main()
