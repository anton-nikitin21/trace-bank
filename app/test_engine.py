import copy
import unittest
from engine import analyze, economics, money
from fixtures import demo, document

class EngineTests(unittest.TestCase):
    def test_initial_packet_requires_review(self):
        r = analyze(demo())
        self.assertEqual({i["code"] for i in r["issues"]}, {"AMOUNT", "MISSING_PRIMARY", "INN", "MISSING_CONTRACT"})
        self.assertEqual(r["state"], "needs_review")
        self.assertTrue(any(e["line"] == 6 for i in r["issues"] for e in i["evidence"]))
    def test_corrected_packet_complete(self):
        self.assertEqual(analyze(demo(True))["issues"], [])
    def test_partial_payments_are_summed(self):
        p = demo(True)
        t = copy.deepcopy(p["transactions"][0]); t["id"] = "П-104"; t["amount"] = "80000"
        p["transactions"][0]["amount"] = "400000"; p["transactions"].append(t)
        self.assertEqual(analyze(p)["issues"], [])
    def test_advance_does_not_require_delivery(self):
        p = demo(True); p["transactions"][0]["settlement"] = "advance"
        p["documents"] = [d for d in p["documents"] if d["name"] != "УПД-41.txt"]
        self.assertEqual(analyze(p)["issues"], [])
    def test_duplicates_are_not_double_counted(self):
        p = demo(True); d = copy.deepcopy(p["documents"][1]); d["name"] = "копия.txt"; p["documents"].append(d)
        self.assertEqual([i["code"] for i in analyze(p)["issues"]], ["DUPLICATE"])
    def test_bad_extraction_cannot_be_complete(self):
        p = demo(True); p["documents"][1]["text"] = "Неразборчивый документ"
        r = analyze(p)
        self.assertIn("EXTRACTION", [i["code"] for i in r["issues"]])
        self.assertEqual(r["state"], "needs_review")
    def test_unknown_profile_rejected(self):
        p = demo(); p["profile"] = "unapproved"
        with self.assertRaises(ValueError): analyze(p)
    def test_duplicate_transaction_rejected(self):
        p = demo(); p["transactions"].append(copy.deepcopy(p["transactions"][0]))
        with self.assertRaises(ValueError): analyze(p)
    def test_multiple_contracts_require_review(self):
        p=demo(True); p["documents"].append(document("Договор", "Д-41-дубль", "Д-41", "7700000001"))
        self.assertIn("AMBIGUOUS_CONTRACT", [i["code"] for i in analyze(p)["issues"]])
    def test_mixed_scheme_not_force_compared(self):
        p=demo(True); t=copy.deepcopy(p["transactions"][0]); t["id"]="П-104"; t["settlement"]="advance"; p["transactions"].append(t)
        codes=[i["code"] for i in analyze(p)["issues"]]
        self.assertIn("MIXED_SETTLEMENT", codes); self.assertNotIn("AMOUNT", codes)
    def test_money_exact_to_kopeck(self):
        self.assertEqual(money("1 000,01"),100001)
        for v in ("NaN", "Infinity", "-1", "1.001"):
            with self.assertRaises(ValueError): money(v)
    def test_financial_base_and_zero_realization(self):
        r=economics({}); self.assertEqual(r["processed"],25200); self.assertEqual(r["net_annual"],-66000); self.assertIsNone(r["payback_months"])
        r=economics({"realization":0}); self.assertEqual(r["realized_value"],0); self.assertIsNone(r["opex_break_even_cases"])
    def test_financial_no_negative_or_missing_data(self):
        for d in ({"adoption":1.1},{"hour_cost":-1},{"cases":None},{"realization":float('nan')}):
            with self.assertRaises(ValueError): economics(d)

if __name__ == "__main__": unittest.main()
