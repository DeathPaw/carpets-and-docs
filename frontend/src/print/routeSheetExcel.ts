import * as XLSX from 'xlsx'
import { esc } from './printDocs'

interface CellStyle {
  size?: number
  bold?: boolean
  color?: string
  fill?: string
  border?: string
  align?: string
  wrap?: boolean
  money?: boolean
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

/**
 * Перенос существующей HTML-формы в редактируемые ячейки. Источник колонок,
 * строк и реквизитов — сама форма печати, без отдельного запроса или схемы данных.
 * SheetJS CE пишет значения и объединения; оформление и параметры печати
 * добавляем в стандартный OOXML через ZIP API уже установленной библиотеки.
 */
export function buildRouteSheetExcel(html: string): Uint8Array {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const table = document.querySelector('table')!
  const columnCount = table.rows[0].cells.length
  const title = document.querySelector('h1')!.textContent || ''
  const brand = document.querySelector('.brand')!.textContent || ''
  const subtitle = document.querySelector('.sub')!.textContent || ''
  const brandColumn = Math.floor(columnCount / 2)
  const heading = Array<string>(columnCount).fill('')
  heading[0] = title
  heading[brandColumn] = brand

  const rows: (string | number)[][] = [heading, [subtitle], []]
  const styles = new Map<string, CellStyle>()
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: brandColumn - 1 } },
    { s: { r: 0, c: brandColumn }, e: { r: 0, c: columnCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columnCount - 1 } },
  ]
  styles.set('A1', { size: 12, bold: true, wrap: true })
  styles.set(XLSX.utils.encode_cell({ r: 0, c: brandColumn }), { color: '444444', align: 'right', wrap: true })
  styles.set('A2', { color: '666666' })

  // Пропорции колонок берём из colgroup печатной формы.
  const proportions = Array.from(table.querySelectorAll('col')).map(col => parseFloat(col.style.width))
  const total = proportions.reduce((sum, width) => sum + width, 0)
  const widths = proportions.map(width => width / total * 1050)
  const canvas = globalThis.document.createElement('canvas')
  const context = canvas.getContext('2d')!
  const heightFor = (text: string, width: number, size: number, bold = false): number => {
    context.font = `${bold ? 'bold ' : ''}${size}px Arial`
    const available = Math.max(1, width - 12)
    let lines = 0
    for (const paragraph of text.split('\n')) {
      let line = ''
      lines++
      for (const word of paragraph.split(/\s+/)) {
        if (line && context.measureText(`${line} ${word}`).width > available) {
          lines++
          line = ''
        }
        // CSS word-wrap: break-word в исходной форме.
        const wordWidth = context.measureText(word).width
        lines += Math.max(0, Math.ceil(wordWidth / available) - 1)
        line = line ? `${line} ${word}` : word
      }
    }
    // Небольшой запас учитывает различия переноса Arial в Excel и браузере.
    return (lines * size * 1.35 + 12) * 0.75
  }
  const rowHeights: XLSX.RowInfo[] = [
    { hpt: Math.max(heightFor(title, widths.slice(0, brandColumn).reduce((a, b) => a + b), 16, true),
      heightFor(brand, widths.slice(brandColumn).reduce((a, b) => a + b), 11)) },
    { hpt: 20 }, { hpt: 8 },
  ]

  Array.from(table.rows).forEach((row, index) => {
    const r = index + 3
    const values: (string | number)[] = []
    let column = 0
    let height = 18
    Array.from(row.cells).forEach(cell => {
      const c = column
      const text = cell.textContent || ''
      const header = cell.tagName === 'TH'
      const money = /^-?\d+ ₽$/.test(text)
      values[c] = money ? Number(text.slice(0, -2)) : c === 0 && /^\d+$/.test(text) ? Number(text) : text
      const color = cell.style.color || row.style.color
      const rgb = color.match(/\d+/g)
      const hexColor = rgb?.map(v => Number(v).toString(16).padStart(2, '0')).join('')
      const wrap = cell.style.whiteSpace !== 'nowrap'
      const bold = header || Number(cell.style.fontWeight) >= 600
      const style: CellStyle = {
        size: header ? 7.5 : 8.25,
        bold,
        color: hexColor || (cell.colSpan > 1 ? '999999' : '222222'),
        fill: header ? 'ECF0F1' : index % 2 === 0 ? 'FAFAFA' : undefined,
        border: header ? 'BDC3C7' : 'D6DBDF',
        align: cell.style.textAlign || 'left',
        wrap,
        money,
      }
      const width = widths.slice(c, c + cell.colSpan).reduce((a, b) => a + b)
      if (wrap) height = Math.max(height, heightFor(text, width, header ? 10 : 11, bold))
      for (let offset = 0; offset < cell.colSpan; offset++) {
        styles.set(XLSX.utils.encode_cell({ r, c: c + offset }), style)
        if (offset) values[c + offset] = ''
      }
      if (cell.colSpan > 1) merges.push({ s: { r, c }, e: { r, c: c + cell.colSpan - 1 } })
      column += cell.colSpan
    })
    rows.push(values)
    rowHeights.push({ hpt: height })
  })

  const sheet = XLSX.utils.aoa_to_sheet(rows)
  // Явная ширина OOXML не зависит от глобальных настроек SheetJS, которые
  // меняются после чтения других Excel-файлов (например, на странице импорта).
  sheet['!cols'] = widths.map(wpx => ({ width: Math.round(wpx / 6 * 256) / 256 }))
  sheet['!rows'] = rowHeights
  sheet['!merges'] = merges
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Маршрутный лист')
  const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })), { type: 'buffer' })
  const readXml = (path: string): Document => new DOMParser().parseFromString(
    new TextDecoder().decode(XLSX.CFB.find(zip, `/${path}`).content), 'application/xml')
  const writeXml = (path: string, xml: Document) => XLSX.CFB.utils.cfb_add(zip, `/${path}`,
    new TextEncoder().encode(new XMLSerializer().serializeToString(xml)))

  const styleList: CellStyle[] = [{}]
  const styleIds = new Map<string, number>()
  const worksheetXml = readXml('xl/worksheets/sheet1.xml')
  worksheetXml.querySelectorAll('c').forEach(cell => {
    const style = styles.get(cell.getAttribute('r')!)
    if (!style) return
    const key = JSON.stringify(style)
    let id = styleIds.get(key)
    if (id === undefined) {
      id = styleList.length
      styleIds.set(key, id)
      styleList.push(style)
    }
    cell.setAttribute('s', String(id))
  })
  const borders = ['BDC3C7', 'D6DBDF']
  const fonts = styleList.map(s => `<font><sz val="${s.size || 8.25}"/><name val="Arial"/>
    <color rgb="FF${s.color || '222222'}"/>${s.bold ? '<b/>' : ''}</font>`).join('')
  const fills = styleList.map(s => `<fill><patternFill patternType="${s.fill ? 'solid' : 'none'}">
    ${s.fill ? `<fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/>` : ''}</patternFill></fill>`).join('')
  const borderXml = borders.map(color => `<border>${['left', 'right', 'top', 'bottom'].map(side =>
    `<${side} style="thin"><color rgb="FF${color}"/></${side}>`).join('')}<diagonal/></border>`).join('')
  const xfs = styleList.map((s, i) => `<xf numFmtId="${s.money ? 164 : 0}" fontId="${i}" fillId="${i + 2}"
    borderId="${s.border ? borders.indexOf(s.border) + 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1" applyNumberFormat="1">
    <alignment horizontal="${esc(s.align || 'left')}" vertical="top" wrapText="${s.wrap ? 1 : 0}"/></xf>`).join('')
  const stylesXml = `<styleSheet xmlns="${NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="0&quot; ₽&quot;"/></numFmts>
    <fonts count="${styleList.length}">${fonts}</fonts><fills count="${styleList.length + 2}"><fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>${fills}</fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>${borderXml}</borders>
    <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${styleList.length}">${xfs}</cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  XLSX.CFB.utils.cfb_add(zip, '/xl/styles.xml', new TextEncoder().encode(stylesXml))

  const create = (name: string, attributes: Record<string, string> = {}) => {
    const element = worksheetXml.createElementNS(NS, name)
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value))
    return element
  }
  const sheetPr = create('sheetPr')
  sheetPr.appendChild(create('pageSetUpPr', { fitToPage: '1' }))
  worksheetXml.documentElement.insertBefore(sheetPr, worksheetXml.documentElement.firstChild)
  worksheetXml.querySelector('sheetView')?.setAttribute('showGridLines', '0')
  const afterPrintSettings = worksheetXml.querySelector('ignoredErrors, drawing, extLst')
  worksheetXml.documentElement.insertBefore(create('pageMargins', {
    left: '0.315', right: '0.315', top: '0.315', bottom: '0.315', header: '0', footer: '0',
  }), afterPrintSettings)
  worksheetXml.documentElement.insertBefore(create('pageSetup', {
    paperSize: '9', orientation: 'landscape', fitToWidth: '1', fitToHeight: '0',
  }), afterPrintSettings)
  writeXml('xl/worksheets/sheet1.xml', worksheetXml)

  const workbookXml = readXml('xl/workbook.xml')
  const names = workbookXml.createElementNS(NS, 'definedNames')
  for (const [name, value] of [
    ['_xlnm.Print_Area', `'Маршрутный лист'!$A$1:$${XLSX.utils.encode_col(columnCount - 1)}$${rows.length}`],
    ['_xlnm.Print_Titles', "'Маршрутный лист'!$4:$4"],
  ]) {
    const defined = workbookXml.createElementNS(NS, 'definedName')
    defined.setAttribute('name', name)
    defined.setAttribute('localSheetId', '0')
    defined.textContent = value
    names.appendChild(defined)
  }
  workbookXml.documentElement.insertBefore(names, workbookXml.querySelector('calcPr'))
  writeXml('xl/workbook.xml', workbookXml)
  return new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true }))
}

export function downloadRouteSheetExcel(html: string, filename: string): void {
  const bytes = buildRouteSheetExcel(html)
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const link = globalThis.document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
