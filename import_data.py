import pandas as pd
import requests

SUPABASE_URL = "https://bjrrlikjinhcbkyherim.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqcnJsaWtqaW5oY2JreWhlcmltIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODU3MDg3MSwiZXhwIjoyMDk0MTQ2ODcxfQ.LVp5w1R_zDGcQkcOHUh9WGW0qfh1SntsqAvph7g96i4"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def to_float(val):
    try:
        return float(str(val).replace(",", "").strip())
    except:
        return 0

def upload(table, rows):
    for i in range(0, len(rows), 500):
        batch = rows[i:i+500]
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=HEADERS,
            json=batch
        )
        if r.status_code not in [200, 201]:
            print(f"  ERROR: {r.text[:200]}")
            return False
    return True

# ── SALES ─────────────────────────────────────────────────
print("Importing Sales...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="SALE DATABASE", header=0)
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    rows.append({
        "invoice_no":     str(r.get("Invoice No.", "")),
        "company_name":   str(r.get("INVOICE TO", "")),
        "address":        str(r.get("Address", "")),
        "state":          str(r.get("State", "")),
        "gst_no":         str(r.get("GST No.", "")),
        "contact_person": str(r.get("Contact Person Name", "")),
        "phone":          str(r.get("Phone", "")),
        "description":    str(r.get("DESCRIPTION", "")),
        "total_price":    to_float(r.get("TOTAL PRICE", 0)),
        "invoice_pdf":    str(r.get("INVOICE PDF", "")),
        "created_at":     str(r.get("TimeStamp", ""))
    })
if upload("sales", rows):
    print(f"  ✅ {len(rows)} rows uploaded")

# ── EXPENSES ──────────────────────────────────────────────
print("Importing Expenses...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="EXPENSES", header=0)
df.columns = ["TIMESTAMP","DATE","VOUCHER_NO","PARTY_NAME","GROUP","SUB_GROUP","DESIGN_NUMBER","AMOUNT","TYPE"]
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    rows.append({
        "date":          str(r["DATE"]),
        "voucher_no":    str(r["VOUCHER_NO"]),
        "party_name":    str(r["PARTY_NAME"]),
        "grp":           str(r["GROUP"]),
        "sub_group":     str(r["SUB_GROUP"]),
        "design_number": str(r["DESIGN_NUMBER"]),
        "amount":        to_float(r["AMOUNT"]),
        "type":          str(r["TYPE"])
    })
if upload("expenses", rows):
    print(f"  ✅ {len(rows)} rows uploaded")

# ── PENDING ───────────────────────────────────────────────
print("Importing Pending...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="PENDING RECEIPT", header=0)
df.columns = ["TIMESTAMP","BILL_DATE","BILL_REF_NO","PARTY_NAME","PARTY_GROUP","SUB_GROUP","MAIN_GROUP","SALES_PERSON","PENDING_AMOUNT","DUE_DATE","OVERDUE_DAYS"]
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    rows.append({
        "bill_date":      str(r["BILL_DATE"]),
        "bill_ref_no":    str(r["BILL_REF_NO"]),
        "party_name":     str(r["PARTY_NAME"]),
        "party_group":    str(r["PARTY_GROUP"]),
        "sub_group":      str(r["SUB_GROUP"]),
        "sales_person":   str(r["SALES_PERSON"]),
        "pending_amount": str(r["PENDING_AMOUNT"]),
        "due_date":       str(r["DUE_DATE"]),
        "overdue_days":   to_float(r["OVERDUE_DAYS"])
    })
if upload("pending", rows):
    print(f"  ✅ {len(rows)} rows uploaded")

# ── LEDGER ────────────────────────────────────────────────
print("Importing Ledger...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="LEDGER BALANCE", header=0)
df.columns = [str(c).strip() for c in df.columns]
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    rows.append({
        "name":               str(r.get("Name", "")),
        "subgroup":           str(r.get("Subgroup", "")),
        "state":              str(r.get("State", "")),
        "email":              str(r.get("Email", "")),
        "contact_person":     str(r.get("Contact Person", "")),
        "mobile":             str(r.get("Mobile", "")),
        "opening_balance":    to_float(r.get("Opening Balance", 0)),
        "voucher_date":       str(r.get("Voucher Date", "")),
        "voucher_particular": str(r.get("Voucher Particular", "")),
        "voucher_type":       str(r.get("Voucher Type", "")),
        "voucher_no":         str(r.get("Voucher No", "")),
        "voucher_debit":      to_float(r.get("Voucher Debit", 0)),
        "voucher_credit":     to_float(r.get("Voucher Credit", 0)),
        "closing_balance":    to_float(r.get("Closing Balance", 0))
    })
if upload("ledger", rows):
    print(f"  ✅ {len(rows)} rows uploaded")

print("\n🎉 All data imported to Supabase!")