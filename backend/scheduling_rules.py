from __future__ import annotations


DAY_CODES = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
DAY_ALIASES = {
    "mon": "mon", "monday": "mon", "周一": "mon", "星期一": "mon", "一": "mon",
    "tue": "tue", "tues": "tue", "tuesday": "tue", "周二": "tue", "星期二": "tue", "二": "tue",
    "wed": "wed", "wednesday": "wed", "周三": "wed", "星期三": "wed", "三": "wed",
    "thu": "thu", "thur": "thu", "thurs": "thu", "thursday": "thu", "周四": "thu", "星期四": "thu", "四": "thu",
    "fri": "fri", "friday": "fri", "周五": "fri", "星期五": "fri", "五": "fri",
    "sat": "sat", "saturday": "sat", "周六": "sat", "星期六": "sat", "六": "sat",
    "sun": "sun", "sunday": "sun", "周日": "sun", "周天": "sun", "星期日": "sun", "星期天": "sun", "日": "sun", "天": "sun",
}


def canonical_day(value: object) -> str | None:
    return DAY_ALIASES.get(str(value or "").strip().lower().replace(".", ""))
