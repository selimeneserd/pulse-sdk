"""Public fixtures only; no user credentials or identity data."""
from pathlib import Path
import hashlib, hmac, json
vectors=json.loads((Path(__file__).resolve().parent.parent/'contracts/fixtures/identity-vectors.json').read_text())
for vector in vectors:
    material=json.dumps(['pulse.identity.v1',vector['projectNamespace'],vector['domain'],'app_account',vector['epoch'],vector['value']],ensure_ascii=False,separators=(',',':')).encode('utf8')
    assert material.hex()==vector['serialized_utf8_hex']
    assert 'h1_'+hmac.new(vector['secret'].encode('utf8'),material,hashlib.sha256).hexdigest()==vector['expected']
print(f'{len(vectors)} public identity vectors passed / açık kimlik vektörü geçti')
