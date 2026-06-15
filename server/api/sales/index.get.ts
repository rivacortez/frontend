import { listSales } from '../../utils/pos-adapter'

// E04 (cobros) — Proxy → backend: GET /api/sales (desc por emisión). El backend
// no acepta filtros, así que el BFF aplica los mismos `q`/`docType` que soportaba
// el mock (la pantalla de comprobantes igual filtra en cliente; esto mantiene el
// contrato del BFF por si algún consumidor los envía).
export default defineEventHandler(async (event) => {
  const { q, docType } = getQuery(event)
  let sales = await listSales(event)

  if (typeof docType === 'string' && (docType === 'boleta' || docType === 'factura')) {
    sales = sales.filter(s => s.docType === docType)
  }
  if (typeof q === 'string' && q.trim()) {
    const needle = q.trim().toLowerCase()
    sales = sales.filter(s =>
      `${s.serie}-${s.number}`.toLowerCase().includes(needle)
      || (s.customer ?? '').toLowerCase().includes(needle)
      || (s.tableLabel ?? '').toLowerCase().includes(needle),
    )
  }

  return ok(sales, { totalCount: sales.length, page: 1 })
})
