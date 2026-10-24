import { describe, expect, it } from 'vitest'
import { aggregateBills, calculateBill } from './calculations'

describe('calculateBill', () => {
  it('calculates per-line discount, total, and physical payment', () => {
    const result = calculateBill([
      { name: 'Hair Cut', unit_price: 300, discount: 50 },
      { name: 'Facial', unit_price: 1500, discount: 200 },
    ])

    expect(result.subtotal).toBe(1800)
    expect(result.totalDiscount).toBe(250)
    expect(result.netAmount).toBe(1550)
    expect(result.giftCardAmount).toBe(0)
    expect(result.physicalAmount).toBe(1550)
  })

  it('redeems only the available gift-card balance', () => {
    const result = calculateBill([{ name: 'Makeup', unit_price: 1200, discount: 0 }], 600)

    expect(result.giftCardAmount).toBe(600)
    expect(result.physicalAmount).toBe(600)
  })

  it('never lets a line discount exceed its price', () => {
    const result = calculateBill([{ name: 'Threading', unit_price: 200, discount: 500 }])

    expect(result.lines[0].discount).toBe(200)
    expect(result.lines[0].line_total).toBe(0)
  })
})

describe('aggregateBills', () => {
  it('keeps revenue, collections, and gift-card redemption separate', () => {
    const stats = aggregateBills([{
      created_at: '2026-10-24T10:00:00.000Z',
      subtotal: 1200,
      total_discount: 100,
      net_amount: 1100,
      physical_amount: 500,
      gift_card_amount: 600,
      items: [
        { service_name: 'Facial', line_total: 900 },
        { service_name: 'Threading', line_total: 200 },
      ],
    }])

    expect(stats.grossServiceValue).toBe(1200)
    expect(stats.discounts).toBe(100)
    expect(stats.netServiceRevenue).toBe(1100)
    expect(stats.physicalCollections).toBe(500)
    expect(stats.giftCardRedemptions).toBe(600)
    expect(stats.totalBills).toBe(1)
    expect(stats.totalServices).toBe(2)
    expect(stats.byService[0]).toEqual({ name: 'Facial', count: 1, revenue: 900 })
  })
})
