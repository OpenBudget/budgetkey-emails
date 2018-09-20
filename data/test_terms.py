import logging
import json
import requests
import urllib

logging.getLogger().setLevel(logging.INFO)

SECTIONS = [
    ('מכרזים שנסגרים השבוע', 
     'הזדמנות אחרונה להגיש הצעות!',
     'dd=tenders&theme=govbuy&focused=closing'
    ),
    ('מכרזים חדשים',
     'מכרזים חדשים שעשויים לעניין אותך',
     'dd=tenders&theme=govbuy&focused=new'
    ),
    ('בקשות חדשות לפטור ממכרז',
     'משרדי ממשלה ויחידות פרסמו השבוע תהליכי רכש בפטור ממכרז בנושאים אלו',
     'dd=exemptions&theme=govbuy&focused=new'
    ),
    ('התקשרויות חדשות',
     'התקשרויות חדשות בנושאים שמעניינים אותך',
     'dd=contracts&theme=govbuy&focused=new'
    ),
    ('ומה חוץ מזה?',
     'עוד כמה עדכונים שקשורים בחיפושים השמורים שלך',
     'dd=tenders&theme=govbuy&focused=updated'
    ),
]


def query_url(term, filters):
    term = urllib.parse.quote_plus(term)
    return f'https://next.obudget.org/s/?q={term}&{filters}'

def test(items, *_):
    logging.info('ITEMS: %r', items)
    sections = []
    for header, subheader, filters in SECTIONS:
        terms = []
        section = dict(
            header=header,
            subheader=subheader,
            terms=terms
        )
        for term in items:
            terms.append(dict(
                term=term,
                query_url=query_url(term, filters)
            ))
        if len(terms) > 0:
            sections.append(section)
    if len(sections) > 0:
        ret = dict(
            sections=sections,
            email='test@example.com',
            debug=True
        )
        logging.info('DATAS: %r', ret)
        result = requests.post('http://localhost:8000/', json=ret).json()
        logging.info('RESULT: %r', result)

if __name__=='__main__':
    test(['משרד'])