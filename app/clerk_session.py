import os
import jwt

ISSUER = os.environ.get("TRACE_CLERK_ISSUER", "https://correct-octopus-4820.clerk.accounts.dev").rstrip("/")
PARTIES = os.environ.get("TRACE_AUTHORIZED_PARTIES", "http://127.0.0.1:8770,http://localhost:8770").split(",")
keys = jwt.PyJWKClient(ISSUER + "/.well-known/jwks.json", timeout=5)

def verify(token):
    claims = jwt.decode(token, keys.get_signing_key_from_jwt(token).key,
                        algorithms=["RS256"], issuer=ISSUER,
                        options={"require": ["exp", "iat", "nbf", "sub", "sid", "azp"]})
    if claims["azp"] not in PARTIES or claims.get("sts") == "pending":
        raise jwt.InvalidTokenError("Invalid session")
    organization = claims.get("o", {})
    org_id = organization.get("id") or claims.get("org_id")
    role = organization.get("rol") or claims.get("org_role", "")
    if not org_id:
        raise jwt.InvalidTokenError("Organization required")
    role = role.removeprefix("org:")
    return {"user": claims["sub"], "organization": org_id,
            "role": role if role in {"admin", "editor"} else "reader"}
