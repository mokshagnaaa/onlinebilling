const money = (value) => Math.round((Number(value) || 0) * 100) / 100

export function calculateLine(item) {
  const price = Math.max(0, money(item.unit_price ?? item.price))
  const discount = Math.min(price, Math.max(0, money(item.discount)))
  return {
    ...item,
    unit_price: price,
    discount,
    line_total: money(price - discount),
  }
}

export function calculateBill(items, giftCardBalance = 0) {
  const lines = (items || [])
    .map(calculateLine)
    .filter((item) => item.name?.trim() || item.service_name?.trim())
  const subtotal = money(lines.reduce((total, line) => total + line.unit_price, 0))
  const totalDiscount = money(lines.reduce((total, line) => total + line.discount, 0))
  const netAmount = money(lines.reduce((total, line) => total + line.line_total, 0))
  const giftCardAmount = Math.min(netAmount, Math.max(0, money(giftCardBalance)))

  return {
    lines,
    subtotal,
    totalDiscount,
    netAmount,
    giftCardAmount: money(giftCardAmount),
    physicalAmount: money(netAmount - giftCardAmount),
  }
}

export function aggregateBills(bills, { from, to } = {}) {
  const selected = (bills || []).filter((bill) => {
    const date = indiaDateKey(bill.created_at)
    return (!from || date >= from) && (!to || date <= to)
  })
  const byService = new Map()
  let grossServiceValue = 0
  let discounts = 0
  let netServiceRevenue = 0
  let physicalCollections = 0
  let giftCardRedemptions = 0
  let totalServices = 0

  selected.forEach((bill) => {
    grossServiceValue += Number(bill.subtotal) || 0
    discounts += Number(bill.total_discount) || 0
    netServiceRevenue += Number(bill.net_amount ?? bill.final_amount) || 0
    physicalCollections += Number(bill.physical_amount) || 0
    giftCardRedemptions += Number(bill.gift_card_amount) || 0
    ;(bill.items || bill.bill_items || []).forEach((item) => {
      const key = item.service_name || item.name || 'Custom service'
      const existing = byService.get(key) || { name: key, count: 0, revenue: 0 }
      existing.count += 1
      existing.revenue += Number(item.line_total ?? item.final_price ?? item.amount) || 0
      byService.set(key, existing)
      totalServices += 1
    })
  })

  return {
    bills: selected,
    grossServiceValue: money(grossServiceValue),
    discounts: money(discounts),
    netServiceRevenue: money(netServiceRevenue),
    physicalCollections: money(physicalCollections),
    giftCardRedemptions: money(giftCardRedemptions),
    totalBills: selected.length,
    totalServices,
    byService: [...byService.values()].sort((a, b) => b.revenue - a.revenue),
  }
}

export function dateRangeForPreset(preset) {
  const now = indiaCalendarDate()
  const iso = (date) => date.toISOString().slice(0, 10)
  const start = new Date(now)
  if (preset === 'day') return { from: iso(now), to: iso(now) }
  if (preset === 'week') start.setDate(now.getDate() - 6)
  if (preset === 'month') start.setDate(1)
  if (preset === 'year') start.setMonth(0, 1)
  return { from: iso(start), to: iso(now) }
}

export { money }

export function indiaDateKey(value) {
  const pieces = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type) => pieces.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function indiaCalendarDate() {
  const [year, month, day] = indiaDateKey(new Date()).split('-').map(Number)
  // UTC noon preserves the Indian civil date when adding or subtracting days.
  return new Date(Date.UTC(year, month - 1, day, 12))
}
