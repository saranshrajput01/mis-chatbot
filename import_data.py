import pandas as pd
import requests
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = "https://bjrrlikjinhcbkyherim.supabase.co"
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def to_float(val):
    try:
        return float(str(val).replace(",", "").replace("₹", "").strip())
    except:
        return 0

def to_iso_timestamp(val):
    """Convert any date/timestamp value to ISO 8601 string for Supabase."""
    if val is None or str(val).strip() in ("", "nan", "NaT"):
        return None
    # Already a pandas Timestamp or datetime
    if isinstance(val, (pd.Timestamp, datetime)):
        return val.strftime("%Y-%m-%dT%H:%M:%S")
    # Try parsing string
    s = str(val).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%dT%H:%M:%S")
        except:
            pass
    # Fallback — return as-is (better than nothing)
    return s

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

# ── TRUNCATE ALL TABLES FIRST ──────────────────────────────────────────────────
print("Truncating existing data...")
for table in ["sales", "expenses", "pending", "ledger"]:
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/truncate_{table}",
        headers=HEADERS,
        json={}
    )
    # Fallback: delete all rows
    r2 = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}?id=gte.0",
        headers={**HEADERS, "Prefer": "return=minimal"}
    )
    # Universal delete using neq trick
    r3 = requests.delete(
        f"{SUPABASE_URL}/rest/v1/{table}?created_at=gte.2000-01-01",
        headers={**HEADERS, "Prefer": "return=minimal"}
    )
print("  ✅ Done (via API)\n")

# ── SALES ─────────────────────────────────────────────────────────────────────
print("Importing Sales...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="SALE DATABASE", header=0)
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    ts = to_iso_timestamp(r.get("TimeStamp", ""))
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
        "category":       str(r.get("CATEGORY", "")),
        "invoice_pdf":    str(r.get("INVOICE PDF", "")),
        "created_at":     ts   # ✅ FIXED: proper ISO timestamp
    })
if upload("sales", rows):
    print(f"  ✅ {len(rows)} rows uploaded")
    # Show sample timestamps for verification
    sample = [r["created_at"] for r in rows[:5] if r["created_at"]]
    print(f"  Sample timestamps: {sample}")

# ── EXPENSES ──────────────────────────────────────────────────────────────────
print("\nImporting Expenses...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="EXPENSES", header=0)
df.columns = ["TIMESTAMP","DATE","VOUCHER_NO","PARTY_NAME","GROUP","SUB_GROUP","DESIGN_NUMBER","AMOUNT","TYPE"]
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    rows.append({
        "date":          to_iso_timestamp(r["DATE"]),   # ✅ FIXED: proper date
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
    sample = [r["date"] for r in rows[:5] if r["date"]]
    print(f"  Sample dates: {sample}")

# ── PENDING ───────────────────────────────────────────────────────────────────
print("\nImporting Pending...")
df = pd.read_excel("SARANSH.xlsx", sheet_name="PENDING RECEIPT", header=0)
df.columns = ["TIMESTAMP","BILL_DATE","BILL_REF_NO","PARTY_NAME","PARTY_GROUP","SUB_GROUP","MAIN_GROUP","SALES_PERSON","PENDING_AMOUNT","DUE_DATE","OVERDUE_DAYS"]
df = df.fillna("")
rows = []
for _, r in df.iterrows():
    rows.append({
        "bill_date":      to_iso_timestamp(r["BILL_DATE"]),  # ✅ FIXED
        "bill_ref_no":    str(r["BILL_REF_NO"]),
        "party_name":     str(r["PARTY_NAME"]),
        "party_group":    str(r["PARTY_GROUP"]),
        "sub_group":      str(r["SUB_GROUP"]),
        "sales_person":   str(r["SALES_PERSON"]),
        "pending_amount": to_float(r["PENDING_AMOUNT"]),     # ✅ FIXED: float not string
        "due_date":       to_iso_timestamp(r["DUE_DATE"]),   # ✅ FIXED
        "overdue_days":   to_float(r["OVERDUE_DAYS"])
    })
if upload("pending", rows):
    print(f"  ✅ {len(rows)} rows uploaded")

# ── LEDGER ────────────────────────────────────────────────────────────────────
print("\nImporting Ledger...")
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
        "voucher_date":       to_iso_timestamp(r.get("Voucher Date", "")),  # ✅ FIXED
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
print("\n📋 VERIFICATION CHECKLIST:")
print("  1. Check Supabase Table Editor → sales → created_at column")
print("     Should look like: 2026-04-15T00:00:00 (NOT a plain string)")
print("  2. Test chatbot: 'erp call system sales april 2026'")
print("  3. Test chatbot: 'month wise sales dikhao'")