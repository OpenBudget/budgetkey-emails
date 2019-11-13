import requests
import urllib.parse

BODY = dict(
    sections=[dict(
        header='זהו מייל נסיון',
        subheader='נעם, בבקשה שלח לי כמה סקרינשוטים!',
        terms=[dict(
            term='התאמה',
            query_url='https://next.obudget.org/s/?q=%s&dd=entities' % urllib.parse.quote_plus('התאמה')
        ), dict(
            term='מסכים',
            query_url='https://next.obudget.org/s/?q=%s&dd=procurement' % urllib.parse.quote_plus('מסכים')
        ), dict(
            term='שונים',
            query_url='https://next.obudget.org/s/?q=%s&dd=budget' % urllib.parse.quote_plus('שונים')
        )]
    )],
    email='adam.kariv@gmail.com'
)

if __name__ == '__main__':
    print(requests.post('http://localhost:8000', json=BODY).content)