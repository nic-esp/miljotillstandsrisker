#!/usr/bin/env python3
"""Reproducible PDF template from the same manuscript and approved interview excerpts.
Requires reportlab (see report/requirements.txt). No network or model calls.
"""
import hashlib
import html
import json
import os
import subprocess
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether, Image, HRFlowable,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.graphics.shapes import Drawing, Rect, Line, String

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'report/output'
OUT.mkdir(parents=True, exist_ok=True)
report = json.loads((ROOT / 'report/manuscript.json').read_text())
interviews = json.loads((ROOT / 'report/interviews.json').read_text())
report_measurement = json.loads((ROOT / 'report/measurement.json').read_text())
currency = (report_measurement.get('provenance') or {}).get('currency', 'SEK')
money_unit = 'mnkr' if currency == 'SEK' else 'mn ' + currency
figures = json.loads(subprocess.check_output([os.environ.get('REPORT_NODE','node'),str(ROOT / 'scripts/report-figures.mjs')], text=True))
fontdir = Path(os.environ.get('REPORT_FONT_DIR', '/System/Library/Fonts/Supplemental'))
if (fontdir / 'Arial.ttf').exists():
    fonts = [('Body', 'Arial.ttf'), ('Bold', 'Arial Bold.ttf'), ('Serif', 'Georgia.ttf')]
else:
    fontdir = Path('/usr/share/fonts/truetype/dejavu')
    fonts = [('Body', 'DejaVuSans.ttf'), ('Bold', 'DejaVuSans-Bold.ttf'), ('Serif', 'DejaVuSerif.ttf')]
for name, filename in fonts:
    pdfmetrics.registerFont(TTFont(name, str(fontdir / filename)))
pdfmetrics.registerFontFamily('Body', normal='Body', bold='Bold', italic='Body', boldItalic='Bold')
ink = colors.HexColor('#1f272f')
muted = colors.HexColor('#62717f')
orange = colors.HexColor('#ea8f12')
line = colors.HexColor('#cfd4d8')
pale = colors.HexColor('#eff2f5')
styles = {
    'title': ParagraphStyle('title', fontName='Bold', fontSize=35, leading=38, textColor=ink, spaceAfter=22),
    'subtitle': ParagraphStyle('subtitle', fontName='Serif', fontSize=17, leading=25, textColor=ink, spaceAfter=20),
    'chapter': ParagraphStyle('chapter', fontName='Bold', fontSize=27, leading=32, textColor=ink, spaceAfter=18),
    'lead': ParagraphStyle('lead', fontName='Body', fontSize=13, leading=20, textColor=muted, spaceAfter=22),
    'body': ParagraphStyle('body', fontName='Serif', fontSize=11, leading=18, textColor=ink, spaceAfter=13, allowWidows=0, allowOrphans=0),
    'small': ParagraphStyle('small', fontName='Body', fontSize=8.5, leading=13, textColor=muted, spaceAfter=9),
    'label': ParagraphStyle('label', fontName='Bold', fontSize=9, leading=13, textColor=muted, spaceAfter=12),
    'h3': ParagraphStyle('h3', fontName='Bold', fontSize=15, leading=20, textColor=ink, spaceBefore=16, spaceAfter=11, keepWithNext=True),
    'quote': ParagraphStyle('quote', fontName='Serif', fontSize=17, leading=24, textColor=ink, spaceAfter=12, leftIndent=14),
    'cell': ParagraphStyle('cell', fontName='Body', fontSize=8.5, leading=13, textColor=ink),
    'cellhead': ParagraphStyle('cellhead', fontName='Bold', fontSize=8.5, leading=13, textColor=ink),
}
def p(text, style='body'):
    return Paragraph(html.escape(str(text or '')), styles[style])

class ReportDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(str(filename), pagesize=(210*mm, 297*mm), rightMargin=23*mm,
                         leftMargin=23*mm, topMargin=25*mm, bottomMargin=23*mm,
                         title=report['title'], author='Miljötillståndsrisker')
        self.addPageTemplates(PageTemplate('report', [Frame(self.leftMargin, self.bottomMargin,
                             self.width, self.height, leftPadding=0, rightPadding=0,
                             topPadding=0, bottomPadding=0)], onPage=self.page_chrome))
    def afterFlowable(self, flowable):
        if getattr(flowable, '_reportChapterId', None):
            key = flowable._reportChapterId
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.getPlainText(), key, 0)
            self.notify('TOCEntry', (0, flowable.getPlainText(), self.page, key))
    def page_chrome(self, canvas, doc):
        canvas.saveState()
        if doc.page > 1:
            canvas.setFillColor(muted); canvas.setFont('Body', 8)
            canvas.drawString(self.leftMargin, 283*mm, 'MILJÖTILLSTÅNDSRISKER  /  RAPPORTMALL')
            canvas.setStrokeColor(line); canvas.setLineWidth(.5)
            canvas.line(self.leftMargin, 279*mm, 210*mm-self.rightMargin, 279*mm)
        canvas.setFont('Body', 8); canvas.setFillColor(muted)
        canvas.drawString(self.leftMargin, 13*mm, 'Arbetsutgåva · ' + report['date'])
        canvas.drawRightString(210*mm-self.rightMargin, 13*mm, str(doc.page))
        canvas.restoreState()

doc = ReportDoc(OUT / 'rapportmall.pdf')
story = []
logo = ROOT / 'site/assets/svenskt-naringsliv-logo-pdf.png'
if logo.exists():
    from PIL import Image as PillowImage
    w, h = PillowImage.open(logo).size
    img = Image(str(logo), width=68*mm, height=68*mm*h/w, hAlign='LEFT')
    mast = Table([[img]], colWidths=[doc.width])
    mast.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),ink),('LEFTPADDING',(0,0),(-1,-1),15),('TOPPADDING',(0,0),(-1,-1),17),('BOTTOMPADDING',(0,0),(-1,-1),17)]))
    story += [mast, Spacer(1, 20*mm)]
story += [p('ANALYSRAPPORT · ARBETSMANUS', 'label'), p(report['title'], 'title'),
          p(report['subtitle'], 'subtitle'),
          HRFlowable(width='16%', thickness=4, color=orange, hAlign='LEFT'), Spacer(1, 9*mm),
          p(report['description']), Spacer(1, 10*mm),
          p('Mätresultat och intervjumaterial inväntas. Rapportmallen innehåller disposition och metodram. Den är inte den färdigställda resultatrapporten.', 'small'),
          p(report['extent'], 'small'), p(report['editionId'], 'small'), PageBreak(),
          p('Innehåll', 'chapter')]
toc = TableOfContents()
toc.levelStyles = [ParagraphStyle('toc', fontName='Body',fontSize=8.5,leading=11,textColor=ink,spaceBefore=0,spaceAfter=0,leftIndent=0,rightIndent=20)]
toc.tableStyle = TableStyle([('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),3),('BOTTOMPADDING',(0,0),(-1,-1),3)])
story += [toc]
story += [Spacer(1, 8*mm), p('Om arbetsutgåvan', 'h3'),
          p('Den slutliga rapporten utvecklas från detta manus när mätningen och intervjumaterialet finns. Planerad omfattning är 50–80 sidor samt bilagor, styrd av analysbehovet. Den kortare mallutgåvan fylls inte med konstruerade resultat eller citat.')]
statuses = {'draft':'Arbetsmanus','awaiting_measurement':'Inväntar mätresultat',
            'awaiting_interviews':'Inväntar intervjumaterial','awaiting_integration':'Inväntar samlad analys','reviewed':'Sakgranskad'}
quotes = {e['id']:{**e,'interview':i} for i in interviews['interviews'] for e in i['excerpts']}
for chapter in report['chapters']:
    heading = p(chapter['number'] + '  ' + chapter['title'], 'chapter')
    heading._reportChapterId = chapter['id']
    story += [PageBreak(), p(chapter['part'].upper() + '  /  ' + statuses.get(chapter['status'],'Arbetsmanus'), 'label'),
              heading]
    if chapter.get('lead'): story += [p(chapter['lead'], 'lead')]
    for block in chapter['blocks']:
        kind = block['type']
        if kind in ('p','h3'):
            suffix = ' [' + ', '.join(block['sourceIds']) + ']' if block.get('sourceIds') else ''
            story += [p(block.get('text','')+suffix, 'body' if kind=='p' else 'h3')]
        elif kind == 'note':
            cell = [p(block.get('title','Avgränsning'), 'label'), p(block['text'])]
            table = Table([[cell]], colWidths=[doc.width])
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),pale),('LEFTPADDING',(0,0),(-1,-1),14),('RIGHTPADDING',(0,0),(-1,-1),14),('TOPPADDING',(0,0),(-1,-1),14),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBEFORE',(0,0),(0,-1),2,line)]))
            story += [Spacer(1, 4*mm), table, Spacer(1, 5*mm)]
        elif kind == 'highlight':
            story += [p('Redaktionellt lyft','label'),p(block['text'],'quote')]
            if block.get('sourceIds'): story += [p('['+', '.join(block['sourceIds'])+']','small')]
        elif kind == 'figure':
            story += [p(block['title'],'h3')]
            data=figures.get(block['figureId'],{'kind':'pending'})
            if data['kind']=='bars' and data.get('rows'):
                maximum=max([r['value'] for r in data['rows']]+[1])
                cells=[]
                for r in data['rows']:
                    drawing=Drawing(doc.width*.38,20)
                    drawing.add(Rect(0,3,doc.width*.38*r['value']/maximum,14,fillColor=orange,strokeColor=None))
                    cells.append([p(r['label'],'cell'),drawing,p(f"{r['value']/1e6:,.2f} {money_unit}".replace(',',' ').replace('.',','),'cell')])
                chart=Table(cells,colWidths=[doc.width*.42,doc.width*.4,doc.width*.18])
                chart.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE'),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
                story += [chart]
            elif data['kind']=='histogram':
                drawing=Drawing(doc.width,220)
                left,bottom,plot_w,plot_h=38,30,doc.width-50,160
                bins=data['bins']; lo,hi=bins[0]['lower'],bins[-1]['upper']; span=max(hi-lo,1)
                maximum=max([b['count']/data['sampleCount'] for b in bins]+[.01])
                for fraction in [0,.5,1]:
                    y=bottom+fraction*plot_h
                    drawing.add(Line(left,y,left+plot_w,y,strokeColor=line,strokeWidth=.5))
                    drawing.add(String(0,y-3,f'{fraction*maximum*100:.0f} %',fontName='Body',fontSize=8,fillColor=muted))
                for b in bins:
                    x=left+(b['lower']-lo)/span*plot_w; w=max(2,(b['upper']-b['lower'])/span*plot_w-1)
                    drawing.add(Rect(x,bottom,w,b['count']/data['sampleCount']/maximum*plot_h,fillColor=colors.HexColor('#1d6362'),strokeColor=None))
                for fraction in [0,.5,1]:
                    drawing.add(String(left+fraction*plot_w,bottom-15,f'{(lo+fraction*span)/1e6:.2f}',fontName='Body',fontSize=8,fillColor=muted,textAnchor='middle'))
                story += [drawing,p(f"Median (P50): {data['p50']/1e6:.2f} {money_unit} · P95: {data['p95']/1e6:.2f} {money_unit} · {data['sampleCount']} utfall",'small')]
            else:
                story += [p('Figurunderlag inväntas. Figuren kopplas till rapportens fastställda mätutgåva.','small')]
            citation = ' · Mätutgåva '+report['measurementEditionId'] if report.get('measurementEditionId') else ' · Mätresultat inväntas'
            if data.get('runId'): citation += ' · Run '+data['runId']
            story += [p(block.get('caption','')+citation,'small'),Spacer(1,5*mm)]
        elif kind == 'table':
            columns = block['columns']; rows=[[p(c,'cellhead') for c in columns]]+[[p(c,'cell') for c in row] for row in block['rows']]
            table = Table(rows,colWidths=[doc.width/len(columns)]*len(columns),repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),pale),('LINEBELOW',(0,0),(-1,-1),.4,line),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
            story += [p(block['title'],'h3'),table,Spacer(1,5*mm)]
        elif kind == 'integration':
            findings=[f for f in report.get('findings',[]) if chapter['id'] in f.get('chapterIds',[])]
            if not findings: story += [p('Planerad samlad analys','h3'),p('Mätresultat, intervjufynd och dokumentunderlag vägs samman här. Samstämmighet, motexempel och kunskapsluckor redovisas med spårbara belägg.','small')]
            for f in findings:
                story += [p(f['title'],'h3'),p(f['interpretation']),p('Källbelägg: '+', '.join(f['excerptIds']),'small'),p(f.get('counterEvidence',''),'small'),p(f.get('limitations',''),'small')]
        elif kind == 'quote':
            q=quotes[block['excerptId']]
            story += [p(q['text'],'quote'),p(q['interview']['publicLabel']+' · '+q['locator']+' ['+q['id']+']','small')]
    for q in quotes.values():
        if chapter['id'] in q.get('topicIds',[]): story += [p(q['text'],'quote'),p(q['interview']['publicLabel']+' · '+q['locator']+' ['+q['id']+']','small')]
    if chapter['id']=='referenser':
        for source in report['sources']: story += [p('['+source['id']+'] '+source['title'],'h3'),p(source.get('description',''))]
        for interview in interviews['interviews']: story += [p('['+interview['id']+'] '+interview['publicLabel'],'h3'),p(interview['role'],'small')]
doc.multiBuild(story)
manifest = {name:hashlib.sha256((ROOT/path).read_bytes()).hexdigest() for name,path in [('manuscriptSha256','report/manuscript.json'),('interviewsSha256','report/interviews.json'),('measurementSha256','report/measurement.json')]}
(OUT / 'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(OUT / 'rapportmall.pdf')
