import os, json, re, base64, html, pathlib, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
PUBLIC=ROOT/"public"; DB=PUBLIC/"data"/"businesses.json"; PAGES=PUBLIC/"nfcbusinesscp"
def fail(msg): raise SystemExit(msg)
def esc(x): return html.escape(str(x or ""), quote=True)
def safe_id(x):
    if not isinstance(x,str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,50}",x): fail("Invalid business ID")
    return x
def url_ok(x):
    if not x:return True
    from urllib.parse import urlparse
    p=urlparse(x)
    return p.scheme in ("https","http") and bool(p.netloc)
def page(b):
    links=b.get("links") or {}
    # Button definitions are generated only for links actually supplied.
    defs=[("googleReview","Google Review","fa-brands fa-google"),("instagram","Instagram","fa-brands fa-instagram"),("facebook","Facebook","fa-brands fa-facebook"),("youtube","YouTube","fa-brands fa-youtube"),("whatsapp","WhatsApp","fa-brands fa-whatsapp"),("website","Website","fa-solid fa-globe"),("linkedin","LinkedIn","fa-brands fa-linkedin")]
    buttons=[]
    for key,label,icon in defs:
        u=links.get(key)
        if u and url_ok(u): buttons.append(f'<a class="social" href="{esc(u)}" target="_blank" rel="noopener noreferrer"><i class="{icon}" aria-hidden="true"></i><span>{label}</span></a>')
    for i,u in enumerate(links.get("other",[])):
        if u and url_ok(u): buttons.append(f'<a class="social" href="{esc(u)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link" aria-hidden="true"></i><span>Other link {i+1}</span></a>')
    review=links.get("googleReview")
    review_html=f'<a class="review" href="{esc(review)}" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-google"></i> Write a Google Review</a>' if review and url_ok(review) else ""
    logo="../../" + b["logoPath"].split("public/",1)[-1] if b.get("logoPath","").startswith("public/") else "assets/logo.png"
    # logoPath is stored as public-relative path; use a stable business-local asset URL.
    logo="assets/logo.png"
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#111827">
<title>{esc(b["name"])} | MODULOS.IN</title><meta name="description" content="{esc(b["description"][:155])}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css">
<style>*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;background:linear-gradient(145deg,#f3f6fb,#e9eef6);color:#182337;font:15px/1.6 'DM Sans',sans-serif;display:flex;justify-content:center;padding:32px 16px}}main{{width:100%;max-width:480px;margin:auto}}.card{{background:white;border:1px solid #e5eaf1;border-radius:24px;padding:32px 26px;box-shadow:0 22px 70px #17233b12;text-align:center}}.logo{{width:112px;height:112px;object-fit:contain;border-radius:20px;background:#f6f8fb;border:1px solid #edf0f5;padding:8px}}h1{{font-size:26px;line-height:1.2;margin:20px 0 8px;letter-spacing:-.04em}}.desc{{color:#65728a;margin:0 auto 22px;white-space:pre-wrap;overflow-wrap:anywhere}}.review{{display:flex;align-items:center;justify-content:center;gap:10px;background:#1c2b48;color:white;text-decoration:none;padding:14px;border-radius:12px;font-weight:800;margin:0 0 18px}}.socials{{display:grid;grid-template-columns:1fr 1fr;gap:10px}}.social{{display:flex;align-items:center;justify-content:center;gap:9px;text-decoration:none;color:#26344c;background:#f2f5f9;border:1px solid #e8edf4;border-radius:11px;padding:12px 8px;font-weight:700;font-size:13px;overflow-wrap:anywhere}}.social i{{font-size:17px;color:#3459db}}.foot{{font-size:10px;color:#9aa4b3;letter-spacing:.14em;margin-top:24px;font-weight:800}}@media(max-width:360px){{.card{{padding:25px 16px}}.socials{{grid-template-columns:1fr}}}}</style></head>
<body><main><section class="card"><img class="logo" src="{logo}" alt="{esc(b["name"])} logo"><h1>{esc(b["name"])}</h1><p class="desc">{esc(b["description"])}</p>{review_html}<div class="socials">{''.join(buttons)}</div><div class="foot">POWERED BY MODULOS.IN</div></section></main></body></html>'''
def main():
    raw=os.environ.get("PAYLOAD")
    if not raw: fail("Missing GitHub event payload")
    p=json.loads(raw); action=p.get("action"); db=json.loads(DB.read_text()) if DB.exists() else {"businesses":[]}
    records=db.get("businesses",[])
    if action=="delete":
        bid=safe_id(p.get("id")); found=next((x for x in records if x["id"]==bid),None)
        if not found: fail("Business not found")
        records=[x for x in records if x["id"]!=bid]
        target=PAGES/bid
        if target.exists():
            import shutil; shutil.rmtree(target)
    elif action in ("create","update"):
        b=p.get("business") or {}; bid=safe_id(b.get("id"))
        if not isinstance(b.get("name"),str) or not b["name"].strip() or len(b["name"])>100: fail("Invalid business name")
        if not isinstance(b.get("description"),str) or not b["description"].strip() or len(b["description"])>1200: fail("Invalid description")
        links=b.get("links") or {}
        for v in links.values():
            vals=v if isinstance(v,list) else [v]
            if any(not url_ok(x) for x in vals): fail("Invalid external URL")
        old=next((x for x in records if x["id"]==bid),None)
        if action=="create" and old: fail("Duplicate QR ID")
        if action=="update" and not old: fail("Business to update was not found")
        if old and not p.get("logoBase64") and not b.get("logoPath"): logo_path=old.get("logoPath")
        elif p.get("logoBase64"):
            encoded=p.get("logoBase64")
            if not isinstance(encoded,str): fail("PNG logo is required")
            blob=base64.b64decode(encoded,validate=True)
            if len(blob)>2*1024*1024 or not blob.startswith(bytes([137,80,78,71,13,10,26,10])): fail("Invalid PNG or file exceeds 2 MB")
            logo_dir=PAGES/bid/"assets"; logo_dir.mkdir(parents=True,exist_ok=True); (logo_dir/"logo.png").write_bytes(blob)
            logo_path=f"nfcbusinesscp/{bid}/assets/logo.png"
        else:
            logo_path=f"nfcbusinesscp/{bid}/assets/logo.png"
            logo_file=PUBLIC/logo_path
            if not logo_file.is_file(): fail("Uploaded business logo was not found in the repository")
            blob=logo_file.read_bytes()
            if len(blob)>2*1024*1024 or not blob.startswith(bytes([137,80,78,71,13,10,26,10])): fail("Invalid uploaded PNG or file exceeds 2 MB")
        now=__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
        record={"id":bid,"name":b["name"].strip(),"description":b["description"].strip(),"logoPath":logo_path,"links":links,"createdAt":old.get("createdAt",now) if old else now,"updatedAt":now,"status":"active"}
        if old: records=[record if x["id"]==bid else x for x in records]
        else: records.append(record)
        target=PAGES/bid; target.mkdir(parents=True,exist_ok=True)
        (target/"index.html").write_text(page(record),encoding="utf-8")
    else: fail("Unsupported action")
    db={"businesses":sorted(records,key=lambda x:x["id"])}
    DB.parent.mkdir(parents=True,exist_ok=True); tmp=DB.with_suffix(".tmp"); tmp.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); json.loads(tmp.read_text()); tmp.replace(DB)
if __name__=="__main__": main()
