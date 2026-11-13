import json, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
required=["public/admin/index.html","public/admin/app.js","public/admin/style.css","public/data/businesses.json","worker/src/index.js","worker/wrangler.toml",".github/workflows/business-publish.yml","scripts/apply_business.py","README.md"]
missing=[x for x in required if not (root/x).is_file()]
if missing: raise SystemExit("Missing required files: "+", ".join(missing))
db=json.loads((root/"public/data/businesses.json").read_text())
assert isinstance(db.get("businesses"),list)
worker=(root/"worker/src/index.js").read_text()
for token in ["admin-auth.json","PBKDF2","SETUP_KEY","SESSION_SECRET","GITHUB_TOKEN","uploadLogo","/api/reset-password","workflow"]:
    assert token in worker, token
assert "firebase" not in worker.lower()
generator=(root/"scripts/apply_business.py").read_text()
assert "html.escape" in generator and "index.html" in generator and "businesses.json" in generator
workflow=(root/".github/workflows/business-publish.yml").read_text()
assert "concurrency:" in workflow and "deploy-pages" in workflow
frontend=(root/"public/admin/app.js").read_text()
for token in ["/api/setup-status","/api/setup","/api/login","/api/reset-password","Copy URL","waitForWorkflow","create","update","delete"]:
    assert token in frontend, token
assert "firebase" not in frontend.lower()
print("PASS: structure, JSON, no-Firebase auth flow, KV/password hashing hooks, business generator and Pages workflow.")
print("NOTE: this is a local structural test, not a live GitHub/Cloudflare/domain end-to-end test.")
