"""Explainable document completeness demo. No AML decision or legal advice."""
from collections import defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
import re

VERSION = "0.1.0"
PROFILE = "supply-v1"
KINDS = {"договор": "contract", "акт": "primary", "упд": "primary", "пояснение": "explanation"}
KEYS = {"тип": "kind", "номер": "number", "договор": "contract", "инн контрагента": "inn", "сумма": "amount", "дата": "date"}

def money(value):
    try:
        d = Decimal(str(value).replace(" ", "").replace("\u00a0", "").replace(",", "."))
    except InvalidOperation as exc:
        raise ValueError("Сумма должна быть числом") from exc
    if not d.is_finite() or d < 0 or d.as_tuple().exponent < -2:
        raise ValueError("Нужна неотрицательная сумма с точностью до копейки")
    return int(d * 100)

def parse_document(doc):
    text = doc.get("text", "")
    if not isinstance(text, str) or len(text) > 100_000:
        raise ValueError("Документ должен содержать текст до 100 000 символов")
    fields, anchors, errors = {}, {}, []
    for n, line in enumerate(text.splitlines(), 1):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = KEYS.get(key.strip().lower())
        if not key:
            continue
        if key in fields:
            errors.append("Повторяющееся поле: " + key)
        fields[key] = value.strip()
        anchors[key] = {"file": doc["name"], "line": n, "quote": line}
    fields["kind"] = KINDS.get(fields.get("kind", "").lower(), "unknown")
    for key in ("number", "contract", "inn"):
        if not fields.get(key):
            errors.append("Не удалось извлечь поле: " + key)
    if fields["kind"] == "unknown":
        errors.append("Не удалось определить тип документа")
    if fields.get("inn") and not re.fullmatch(r"\d{10}|\d{12}", fields["inn"]):
        errors.append("Некорректный формат ИНН")
    if fields["kind"] == "primary":
        try:
            fields["amount_cents"] = money(fields.get("amount", ""))
        except ValueError:
            errors.append("Не удалось прочитать сумму первичного документа")
    digest = hashlib.sha256(text.encode()).hexdigest()
    return {"name": doc["name"], "fields": fields, "anchors": anchors,
            "errors": errors, "sha256": digest, "text": text}

def validate_packet(packet):
    if not isinstance(packet, dict):
        raise ValueError("Пакет должен быть JSON-объектом")
    if packet.get("profile") != PROFILE:
        raise ValueError("Неизвестный профиль требований; поддерживается supply-v1")
    if not isinstance(packet.get("case_id"), str) or not re.fullmatch(r"[\w-]{1,80}", packet["case_id"]):
        raise ValueError("Некорректный идентификатор дела")
    if not isinstance(packet.get("customer"), str) or not 1 <= len(packet["customer"]) <= 200:
        raise ValueError("Укажите наименование клиента")
    txs, docs = packet.get("transactions"), packet.get("documents")
    if not isinstance(txs, list) or not 1 <= len(txs) <= 300:
        raise ValueError("Требуется от 1 до 300 операций")
    if not isinstance(docs, list) or len(docs) > 300:
        raise ValueError("Допускается до 300 документов")
    ids, names = set(), set()
    for t in txs:
        if not isinstance(t, dict):
            raise ValueError("Некорректная операция")
        for key in ("id", "contract", "inn", "counterparty", "date", "settlement"):
            if not isinstance(t.get(key), str) or not t[key] or len(t[key]) > 200:
                raise ValueError("Некорректное поле операции: " + key)
        if t["id"] in ids:
            raise ValueError("Повторяющийся ID операции")
        ids.add(t["id"])
        if not re.fullmatch(r"\d{10}|\d{12}", t["inn"]):
            raise ValueError("Некорректный формат ИНН операции")
        if t["settlement"] not in ("full", "advance"):
            raise ValueError("Укажите режим full или advance")
        money(t.get("amount"))
        from datetime import date
        try:
            date.fromisoformat(t["date"])
        except ValueError as exc:
            raise ValueError("Дата операции должна иметь формат ГГГГ-ММ-ДД") from exc
    for d in docs:
        if not isinstance(d, dict) or not isinstance(d.get("name"), str) or not 1 <= len(d["name"]) <= 200:
            raise ValueError("Некорректное имя документа")
        if d["name"] in names:
            raise ValueError("Имена документов должны быть уникальны")
        names.add(d["name"])
        if not isinstance(d.get("text"), str):
            raise ValueError("Нужен текст документа")

def analyze(packet):
    validate_packet(packet)
    docs = [parse_document(d) for d in packet["documents"]]
    issues, groups = [], defaultdict(list)
    def issue(code, title, detail, contract=None, evidence=None, action=None):
        issues.append({"code": code, "title": title, "detail": detail,
                       "contract": contract, "evidence": evidence or [], "action": action or detail})
    by_hash, duplicate_names = {}, set()
    for d in docs:
        if d["errors"]:
            issue("EXTRACTION", "Нужна проверка реквизитов", d["name"] + ": " + "; ".join(d["errors"]), evidence=[{"file": d["name"], "line": 1, "quote": "Проверьте исходный текст"}])
        if d["sha256"] in by_hash:
            duplicate_names.add(d["name"])
            issue("DUPLICATE", "Копия документа", d["name"] + " повторяет " + by_hash[d["sha256"]], evidence=[{"file": d["name"], "line": 1, "quote": "Совпадает SHA-256 содержимого"}], action="Подтвердите, какой экземпляр документа использовать.")
        by_hash[d["sha256"]] = d["name"]
    for t in packet["transactions"]:
        groups[(t["contract"], t["inn"])].append(t)
    rows = []
    for (contract, inn), txs in groups.items():
        start = len(issues)
        related = [d for d in docs if d["fields"].get("contract") == contract and d["name"] not in duplicate_names]
        correct = [d for d in related if d["fields"].get("inn") == inn and not d["errors"]]
        for d in related:
            if d["fields"].get("inn") != inn:
                issue("INN", "Не совпадает контрагент", f"По договору {contract} ожидается ИНН {inn}; в {d['name']} указан {d['fields'].get('inn', 'не извлечён')}.", contract, [d["anchors"].get("inn", {"file": d["name"], "line": 1, "quote": "ИНН не извлечён"})], f"По договору {contract} уточните контрагента: ИНН операции {inn} не совпадает с документом {d['name']}.")
        contracts = [d for d in correct if d["fields"]["kind"] == "contract"]
        primary = [d for d in correct if d["fields"]["kind"] == "primary"]
        if not contracts:
            issue("MISSING_CONTRACT", "Не найден договор", f"Нужен договор {contract} с контрагентом {txs[0]['counterparty']} (ИНН {inn}).", contract)
        if len(contracts) > 1:
            issue("AMBIGUOUS_CONTRACT", "Несколько экземпляров договора", f"По {contract} найдено несколько договоров. Выбор требует проверки сотрудника.", contract, [d["anchors"]["number"] for d in contracts])
        full = {t["settlement"] for t in txs} == {"full"}
        if len({t["settlement"] for t in txs}) > 1:
            issue("MIXED_SETTLEMENT", "Нужно уточнить схему оплаты", f"В группе {contract} смешаны аванс и окончательный расчёт. Автосверка суммы отключена.", contract)
        if full:
            if not primary:
                issue("MISSING_PRIMARY", "Не найден акт или УПД", f"По договору {contract} для заявленного полного расчёта нужен акт или УПД с ИНН {inn}.", contract)
            else:
                amounts = [d["fields"]["amount_cents"] for d in primary]
                paid = sum(money(t["amount"]) for t in txs)
                total = sum(amounts)
                if total != paid:
                    issue("AMOUNT", "Нужно пояснить разницу сумм", f"По {contract}: операции {paid / 100:,.2f} ₽; акты/УПД {total / 100:,.2f} ₽. Разница {abs(total-paid) / 100:,.2f} ₽. Это запрос пояснения, а не вывод о нарушении.", contract, [d["anchors"]["amount"] for d in primary], f"По договору {contract} поясните разницу {abs(total-paid)/100:,.2f} ₽ между суммой операций и актов/УПД либо дополните комплект.")
        elif not primary:
            # Supply-v1 explicitly accepts advance payments without delivery documents.
            pass
        rows.append({"contract": contract, "inn": inn, "counterparty": txs[0]["counterparty"], "transaction_ids": [t["id"] for t in txs],
                     "amount": sum(money(t["amount"]) for t in txs) / 100, "settlement": "full" if full else "advance_or_mixed",
                     "documents": [d["name"] for d in related], "issue_count": len(issues)-start,
                     "status": "needs_review" if len(issues)>start else "complete"})
    requested = {k[0] for k in groups}
    for d in docs:
        if d["fields"].get("contract") not in requested:
            issue("UNLINKED", "Документ не связан с запросом", d["name"] + " не удалось связать с запрошенными договорами.", evidence=[{"file": d["name"], "line": 1, "quote": "Связь с запрошенной операцией не подтверждена"}])
    # Global extraction/duplicate issues keep the entire packet under human review.
    actions = list(dict.fromkeys(i["action"] for i in issues))
    draft = (f"Коллеги, мы проверили комплект по обращению {packet['case_id']}.\n\nДля продолжения рассмотрения просим уточнить:\n" + "\n".join(f"{n}. {a}" for n, a in enumerate(actions, 1)) + "\n\nПросим дополнить текущий комплект. Повторно отправлять остальные документы не требуется. После получения уточнений сотрудник банка продолжит рассмотрение.") if actions else f"Комплект по обращению {packet['case_id']} соответствует выбранному профилю supply-v1. Сотрудник должен проверить содержание, подлинность и достаточность документов для конкретного процесса."
    return {"version": VERSION, "profile": PROFILE, "case_id": packet["case_id"], "customer": packet["customer"], "rows": rows, "issues": issues, "documents": docs, "draft": draft,
            "state": "needs_review" if issues else "complete", "issue_count": len(issues), "transaction_count": len(packet["transactions"]), "document_count": len(docs),
            "scope": "Проверка комплектности по демонстрационному профилю. Решение по операции принимает сотрудник банка. Подписи и подлинность не проверены."}

def economics(inputs):
    defaults = {"cases": 60000, "eligible": 0.6, "adoption": 0.7, "minutes_saved": 6, "hour_cost": 900, "realization": 0.5, "development": 1800000, "integration": 600000, "annual_opex": 1200000}
    data = {**defaults, **inputs}
    for k, v in data.items():
        if k not in defaults or not isinstance(v, (int, float)) or isinstance(v, bool) or not Decimal(str(v)).is_finite() or v < 0:
            raise ValueError("Некорректное допущение: " + k)
    for k in ("eligible", "adoption", "realization"):
        if data[k] > 1:
            raise ValueError("Доля должна быть от 0 до 1: " + k)
    processed = data["cases"] * data["eligible"] * data["adoption"]
    hours = processed * data["minutes_saved"] / 60
    capacity = hours * data["hour_cost"]
    cash = capacity * data["realization"]
    net = cash - data["annual_opex"]
    per_case = data["eligible"] * data["adoption"] * data["minutes_saved"] / 60 * data["hour_cost"] * data["realization"]
    return {"inputs": data, "processed": processed, "hours": hours, "capacity_value": capacity, "realized_value": cash, "net_annual": net,
            "payback_months": (data["development"] + data["integration"]) / net * 12 if net > 0 else None,
            "opex_break_even_cases": data["annual_opex"] / per_case if per_case > 0 else None,
            "first_year_break_even_cases": (data["annual_opex"] + data["development"] + data["integration"]) / per_case if per_case > 0 else None,
            "label": "Сценарные допущения команды. Не измерения банка и не прогноз подтверждённой экономии."}
