#!/usr/bin/env python3
"""Public workshop schedule. Fetch only public booking APIs; publish no private counts.
Run from any directory. Fails before writes if any source is unavailable.
"""
from pathlib import Path
import json,urllib.request,concurrent.futures,datetime,html,sys
from zoneinfo import ZoneInfo
ROOT=Path(__file__).resolve().parents[1]
API='https://portal.shoonyadance.com'
TODAY=datetime.datetime.now(ZoneInfo('Europe/Brussels')).date().isoformat()

def get(path):
 with urllib.request.urlopen(API+path,timeout=30) as r:return json.load(r)
def esc(s):return html.escape(str(s or ''),quote=True)
# Editorial labels and public detail destinations only. Dates/prices/status come from the portal.
META={
'flamenco-technique-3-saturdays':('Flamenco technique','Flamencotechniek','Flamenco','Open level','Open niveau','flamenco-technique'),
'kizomba-intensive-beginner-bootcamp':('Kizomba beginner bootcamp','Kizomba beginnersbootcamp','Kizomba','Beginners','Beginners','kizomba-beginner-bootcamp-series'),
'kizomba-universe-bootcamp':('Exploring the Kizomba universe','Exploring the Kizomba universe','Kizomba','Some Kizomba experience','Enige ervaring met Kizomba','exploring-the-kizomba-universe'),
'indian-dance-winter-intensive-2027':('Indian dance winter intensive','Winterintensive Indiase dans','Indian dance','Level varies by session','Niveau verschilt per sessie','indian-dance-winter-intensive-2027'),
'sevillanas-refresh':('Sevillanas refresh','Sevillanas opfrissen','Sevillanas','See workshop details','Bekijk de workshopdetails','sevillanas-refresh'),
'saaidi-variations':('Saaidi variations','Saaidi-variaties','Raqs Sharqi','Intermediate · some Raqs Sharqi experience','Halfgevorderd · enige ervaring met Raqs Sharqi',None),
'belly-dance-veil-travelling-movements-techniques':('Belly dance: veil & travelling movements','Buikdans: sluier & verplaatsingen','Raqs Sharqi','Intermediate','Halfgevorderd',None),
'round-trip-to-cuba':('Round Trip to Cuba','Round Trip to Cuba','Cuban salsa','Cuban salsa experience · partner required','Ervaring met Cubaanse salsa · partner verplicht','round-trip-to-cuba')}

def load(item):
 slug=item['slug']; m=META.get(slug,(item['title'],item['title'],'Other','See workshop details','Bekijk de workshopdetails',None))
 public_detail=('https://workshops.shoonyadance.com/'+m[5]+'/') if m[5] else None
 if public_detail:
  with urllib.request.urlopen(public_detail,timeout=30) as response: page=response.read().decode('utf-8')
  if 'Registration paused' in page or 'New dates to be announced' in page:
   print('Omitted paused public page: '+slug);return []
 # The pass-only catalogue exposes the host account, not the advertised guest teachers.
 if slug=='round-trip-to-cuba':
  if 'Wilmer &amp; Maria' not in page and 'Wilmer & Maria' not in page:raise ValueError('Review Cuba teacher source')
  item={**item,'teachers':['Wilmer & Maria']}
 detail=get('/api/events/'+slug+'/catalogue') if item['kind']=='event' else get('/api/workshops/schedule?workshop_id='+item['id'])
 sessions=[]
 for s in detail.get('sessions',[]):
  if s['status']=='closed':continue
  for occ in s.get('occurrences') or [{'date':s.get('date'),'start':s.get('start'),'end':s.get('end')}]:
   if not occ.get('date') or occ['date']<TODAY:continue
   sessions.append({'date':occ['date'],'start':occ.get('start'),'end':occ.get('end'),'name':s['name'],'name_nl':s.get('name_nl'),'price':s['price'],'full':s['status']=='full','partner':s['partner_compulsory']})
 if item['kind']=='workshop':
  schedules=detail.get('schedules',[])
  # The public endpoint omits dates: single-day workshops are unambiguous; multi-day courses retain their date range, never invent recurrence dates.
  for s in schedules or [{}]:
   sessions.append({'date':item['fromDate'],'start':s.get('start_time','')[:5] if s.get('start_time') else None,'end':s.get('end_time','')[:5] if s.get('end_time') else None,'name':item['title'],'name_nl':None,'price':item['priceFrom'],'full':item['full'],'partner':item['partnerRequired']})
 if slug=='round-trip-to-cuba':
  sessions=[{'date':'2027-01-23','start':'15:00','end':'18:30','name':'Saturday masterclasses','name_nl':'Masterclasses zaterdag','price':item['passFrom'],'full':item['full'],'partner':True},{'date':'2027-01-24','start':'12:00','end':'15:30','name':'Sunday masterclasses','name_nl':'Masterclasses zondag','price':item['passFrom'],'full':item['full'],'partner':True}]
 rows=[]
 days=sorted(set(s['date'] for s in sessions if s['date']))
 if not days:days=[item['fromDate']]
 for day in days:
  if not day or (item['toDate'] or day)<TODAY:continue
  ss=[s for s in sessions if s['date']==day]
  starts=[s['start'] for s in ss if s['start']];ends=[s['end'] for s in ss if s['end']]
  prices=[s['price'] for s in ss if s['price'] is not None]
  end_date=day if item['kind']=='event' and ss else item['toDate'] or day
  rows.append({'id':item['id'],'slug':slug,'kind':item['kind'],'date':day,'endDate':end_date,'start':min(starts) if starts else None,'end':max(ends) if ends else None,'en':m[0],'nl':m[1],'style':m[2],'level_en':m[3],'level_nl':m[4],'teachers':['Swapnil Dagliya' if t=='Swapnil' else t for t in item['teachers']],'location':item['location'],'price':min(prices) if prices else item['priceFrom'] or item['passFrom'],'fromPrice':len(ss)>1 or item['kind']=='event','full':all(s['full'] for s in ss) if ss else item['full'],'sessions':ss,'details':('https://workshops.shoonyadance.com/'+m[5]+'/') if m[5] else API+item['href'],'book':API+item['href']})
 return rows

def main():
 items=get('/api/catalogue')['items']
 selected=[i for i in items if i['category'] in ('workshop','miniseries','intensive','bootcamp') or i['slug']=='round-trip-to-cuba']
 rows=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for result in pool.map(load,selected):rows.extend(result)
 rows.sort(key=lambda r:(r['date'],r['start'] or '',r['en']))
 data={'updated':TODAY,'source':API+'/api/catalogue','rows':rows}
 template=(ROOT/'_build/workshop-schedule.template.html').read_text()
 for lang in ['en','nl']:
  strings=STRINGS[lang];out=template
  for key,value in strings.items():out=out.replace('{{'+key+'}}',value)
  out=out.replace('{{LANG}}',lang).replace('{{PREFIX}}','/nl' if lang=='nl' else '').replace('{{ALT}}','/nl/workshops/' if lang=='en' else '/workshops/')
  out=out.replace('{{DATA}}',json.dumps(data,ensure_ascii=False).replace('<','\\u003c'))
  # Static rows are regenerated daily for accessibility, sharing, search and no-JS fallback.
  out=out.replace('{{ROWS}}',render_rows(rows,lang))
  target=ROOT/('nl/workshops' if lang=='nl' else 'workshops')/'index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out)
 target=ROOT/'data/workshop-schedule.json';target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 print(f'{len(rows)} dated entries / {len(set(r["slug"] for r in rows))} visible offerings; EN + NL built from public APIs.')

def render_rows(rows,lang):
 out=[];last=None
 for r in rows:
  key=r['date'][:7]
  if last!=key:
   if last is not None:out.append('</section>')
   out.append('<section class="month-group" data-month="'+key+'"><h2>'+esc(month_label(key,lang))+'</h2>');last=key
  ds=datetime.date.fromisoformat(r['date']); wd=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] if lang=='en' else ['ma','di','wo','do','vr','za','zo']
  date=ds.strftime('%d');time=(r['start']+'–'+r['end']) if r['start'] and r['end'] else ('See programme' if lang=='en' else 'Bekijk het programma')
  price=('From ' if lang=='en' else 'Vanaf ') if r['fromPrice'] else ''
  price+=('€'+format(r['price'],'.2f').rstrip('0').rstrip('.')) if r['price'] is not None else ('See prices' if lang=='en' else 'Bekijk prijzen')
  title=r[lang];details=r['details']+'nl/' if lang=='nl' and 'workshops.shoonyadance.com/' in r['details'] else r['details']
  book=r['book']+('?lang=nl' if lang=='nl' else '?lang=en')
  range_text=('Until ' if lang=='en' else 'Tot ')+r['endDate'] if r['endDate']!=r['date'] else ''
  sessions=''
  if r['sessions']:
   unique=[]
   for s in r['sessions']:
    label=(s.get('name_nl') if lang=='nl' else None) or s['name'];v=f"{s.get('start') or ''}–{s.get('end') or ''} · {label}"
    if v not in unique:unique.append(v)
   sessions='<details><summary>'+('Sessions & options' if lang=='en' else 'Sessies & opties')+'</summary><ul>'+''.join('<li>'+esc(v)+'</li>' for v in unique)+'</ul></details>'
  out.append('<article class="workshop-row" data-date="'+r['date']+'" data-end="'+r['endDate']+'" data-style="'+esc(r['style'])+'"><div class="date"><span>'+date+'</span><small>'+wd[ds.weekday()]+'</small></div><div class="event"><p class="style">'+esc({'Indian dance':'Indiase dans','Cuban salsa':'Cubaanse salsa','Other':'Andere'}.get(r['style'],r['style']) if lang=='nl' else r['style'])+'</p><h3><a href="'+esc(details)+'">'+esc(title)+'</a></h3><p>'+esc(' · '.join(r['teachers']))+'</p><p class="facts">'+esc(time)+' · '+esc(r['level_'+lang])+'</p><p class="location">'+esc(r['location'])+'</p>'+('<p>'+esc(range_text)+'</p>' if range_text else '')+sessions+'</div><div class="booking"><p class="price">'+esc(price)+'</p><a class="book" href="'+esc(book)+'">'+(('Full — view options' if lang=='en' else 'Volzet — bekijk opties') if r['full'] else ('Book / availability' if lang=='en' else 'Inschrijven / beschikbaarheid'))+' →</a><a class="detail-link" href="'+esc(details)+'">'+('Workshop details' if lang=='en' else 'Workshopdetails')+'</a></div></article>')
 if last is not None:out.append('</section>')
 return '\n'.join(out)
def month_label(key,lang):
 names=['January','February','March','April','May','June','July','August','September','October','November','December'] if lang=='en' else ['Januari','Februari','Maart','April','Mei','Juni','Juli','Augustus','September','Oktober','November','December']
 return names[int(key[5:])-1]+' '+key[:4]
STRINGS={
'en':dict(TITLE='Workshops & short courses',DESCRIPTION='Find upcoming dance workshops and short courses in Ghent. Compare dates, teachers, levels and prices, then book.',WEEKLY='Weekly class schedule',WORKSHOPS='Workshop schedule',INTRO='Find your next workshop. Browse by month or dance style.',MONTH='Month',ALL_MONTHS='All upcoming',STYLE='Dance style',ALL_STYLES='All styles',FOOT='Looking for socials, festivals or performances?',CALENDAR='See the full events calendar',EMPTY='No workshops match these filters.',RESET='Show all',UPDATED='Prices checked',NOTICE='The booking page confirms current prices and availability.',SKIP='Skip to workshops',ALT_LABEL='Nederlands',CONTACT='Contact',NEW='New here?',CURRENT='Current booking options'),
'nl':dict(TITLE='Workshops & korte reeksen',DESCRIPTION='Ontdek komende dansworkshops en korte reeksen in Gent. Vergelijk data, lesgevers, niveaus en prijzen en schrijf je in.',WEEKLY='Wekelijks lesrooster',WORKSHOPS='Workshopoverzicht',INTRO='Vind jouw volgende workshop. Zoek op maand of dansstijl.',MONTH='Maand',ALL_MONTHS='Alle komende',STYLE='Dansstijl',ALL_STYLES='Alle stijlen',FOOT='Op zoek naar dansavonden, festivals of voorstellingen?',CALENDAR='Bekijk de volledige agenda',EMPTY='Geen workshops voor deze filters.',RESET='Toon alles',UPDATED='Prijzen gecontroleerd',NOTICE='De inschrijfpagina bevestigt de actuele prijzen en beschikbaarheid.',SKIP='Ga naar de workshops',ALT_LABEL='English',CONTACT='Contact',NEW='Nieuw hier?',CURRENT='Actuele inschrijfmogelijkheden')}
if __name__=='__main__':main()
