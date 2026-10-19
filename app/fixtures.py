from copy import deepcopy

def document(kind, number, contract, inn, amount=None):
    return {"name": number + ".txt", "text": f"Тип: {kind}\nНомер: {number}\nДоговор: {contract}\nИНН контрагента: {inn}\nДата: 2026-09-20\n" + (f"Сумма: {amount}\n" if amount is not None else "") + "Синтетический пример. Подлинность и подписи не проверяются."}

def demo(fixed=False):
    txs = [
        {"id": "П-101", "date": "2026-09-24", "counterparty": "ООО Маяк (пример)", "inn": "7700000001", "contract": "Д-41", "amount": "480000.00", "settlement": "full"},
        {"id": "П-102", "date": "2026-09-25", "counterparty": "ООО Берег (пример)", "inn": "7700000002", "contract": "Д-42", "amount": "360000.00", "settlement": "full"},
        {"id": "П-103", "date": "2026-09-26", "counterparty": "ООО Кедр (пример)", "inn": "7700000003", "contract": "Д-43", "amount": "240000.00", "settlement": "full"}
    ]
    docs = [document("Договор", "Д-41", "Д-41", "7700000001"), document("УПД", "УПД-41", "Д-41", "7700000001", "480000" if fixed else "470000"),
            document("Договор", "Д-42", "Д-42", "7700000002"), document("Договор", "Д-43", "Д-43", "7700000003" if fixed else "7700000099"),
            document("Акт", "А-43", "Д-43", "7700000003", "240000")]
    if fixed:
        docs.append(document("Акт", "А-42", "Д-42", "7700000002", "360000"))
    return {"profile": "supply-v1", "case_id": "O-2026-0042", "customer": "ООО Ритм (синтетический пример)", "transactions": txs, "documents": docs}
