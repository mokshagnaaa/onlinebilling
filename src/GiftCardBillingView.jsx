import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Gift,
  LoaderCircle,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { calculateBill } from './lib/calculations'
import { dataApi } from './lib/data'
import { formatDate, formatINR } from './lib/format'
import { InvoiceScreen, SummaryRow } from './App'

const emptyLine = () => ({ key: crypto.randomUUID(), service_id: '', name: '', unit_price: '', discount: 0 })

export function GiftCardBillingView({ data, onRefresh, onNavigate, notify }) {
  const activeCards = (data.giftCards || []).filter((card) => card.status === 'active' && Number(card.remaining_balance) > 0)
  const [selectedCardNumber, setSelectedCardNumber] = useState(() => activeCards[0]?.card_number || 'V100')
  const [searchNumber, setSearchNumber] = useState('')
  const [lines, setLines] = useState([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [savedBill, setSavedBill] = useState(null)

  // Find the selected card
  const currentCard = (data.giftCards || []).find(
    (card) => card.card_number.toUpperCase() === selectedCardNumber.toUpperCase()
  ) || null

  const activeServices = (data.services || []).filter((service) => service.is_active)
  const cardBalance = Number(currentCard?.remaining_balance || 0)

  // Real-time bill calculations
  const totals = useMemo(() => calculateBill(lines, cardBalance), [lines, cardBalance])

  const updateLine = (key, field, value) => {
    setLines((old) =>
      old.map((line) => {
        if (line.key !== key) return line
        if (field === 'service_id') {
          const service = activeServices.find((item) => item.id === value)
          return {
            ...line,
            service_id: value,
            name: service?.name || '',
            unit_price: service?.default_price ?? '',
            discount: 0,
          }
        }
        return { ...line, [field]: value }
      })
    )
  }

  const handleCardSearch = () => {
    if (!searchNumber.trim()) return
    const found = (data.giftCards || []).find(
      (c) => c.card_number.toUpperCase() === searchNumber.trim().toUpperCase()
    )
    if (!found) {
      notify(`Gift card "${searchNumber.toUpperCase()}" not found.`, 'error')
      return
    }
    if (found.status !== 'active' || Number(found.remaining_balance) <= 0) {
      notify(`Card ${found.card_number} is exhausted or inactive (Balance: ${formatINR(found.remaining_balance)}).`, 'error')
    }
    setSelectedCardNumber(found.card_number)
    setSearchNumber('')
    notify(`Selected Gift Card ${found.card_number}`)
  }

  // Exact balance cut calculation requested:
  // e.g. Card has 2000, customer takes 500 service -> cut 2000 - 500 = 1500 remaining balance
  const startingBalance = cardBalance
  const serviceNetTotal = totals.netAmount
  const deductedFromCard = totals.giftCardAmount
  const remainingBalanceAfter = Math.max(0, Number((startingBalance - deductedFromCard).toFixed(2)))
  const extraCashNeeded = totals.physicalAmount

  const handleSaveBill = async () => {
    if (!currentCard) return notify('Please select a valid gift card first.', 'error')
    if (!totals.lines.length) return notify('Please add at least one service to the bill.', 'error')
    if (currentCard.status !== 'active' || currentCard.remaining_balance <= 0) {
      return notify('This gift card has no remaining balance left to redeem.', 'error')
    }

    setSaving(true)
    try {
      const bill = await dataApi.saveBill({
        items: totals.lines,
        giftCardNumber: currentCard.card_number,
      })
      setSavedBill(bill)
      if (!await onRefresh(true)) {
        notify(`Gift card bill ${bill.bill_number} was saved, but the latest bill list could not be loaded. Use Retry.`, 'error')
        return
      }
      notify(
        `Gift Card Bill ${bill.bill_number} saved! ${formatINR(deductedFromCard)} cut from card ${currentCard.card_number}. Remaining: ${formatINR(remainingBalanceAfter)}`
      )
    } catch (error) {
      notify(error.message || 'Could not process gift card bill.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const clearForm = () => {
    setLines([emptyLine()])
    setSavedBill(null)
  }

  if (savedBill) {
    return (
      <InvoiceScreen
        bill={savedBill}
        onBack={() => {
          clearForm()
          onNavigate('bills')
        }}
        onRefresh={onRefresh}
        onNavigate={onNavigate}
        notify={notify}
      />
    )
  }

  return (
    <section className="page bill-page">
      <div className="gift-billing-banner">
        <div>
          <div className="eyebrow" style={{ color: '#fed7aa', marginBottom: 4 }}>
            <Sparkles size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />
            Dedicated Gift Card Billing
          </div>
          <h3>Gift Card POS Checkout</h3>
          <p>Deduct service fees directly from customer gift card balances with instant remaining balance tracking.</p>
        </div>
        <button
          className="secondary-button"
          style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)' }}
          onClick={() => onNavigate('billing')}
        >
          Switch to Standard Bill
        </button>
      </div>

      <div className="gift-selector-grid">
        {/* Card Picker */}
        <article className="panel" style={{ padding: 18 }}>
          <div className="panel__header" style={{ padding: '0 0 12px' }}>
            <div>
              <h3>1. Select Customer Gift Card</h3>
              <p>Choose an active card or enter a card number</p>
            </div>
          </div>

          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
            Quick select from active cards:
          </label>
          <div className="card-select-input">
            <select
              value={selectedCardNumber}
              onChange={(e) => setSelectedCardNumber(e.target.value)}
            >
              {activeCards.length > 0 ? (
                activeCards.map((card) => (
                  <option key={card.id} value={card.card_number}>
                    {card.card_number} — Available: {formatINR(card.remaining_balance)} (Orig: {formatINR(card.original_value)})
                  </option>
                ))
              ) : (
                <option value="">No active cards found</option>
              )}
            </select>
          </div>

          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', margin: '10px 0 6px' }}>
            Or enter card number manually:
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{
                flex: 1,
                height: 38,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '0 10px',
                fontSize: 12,
                textTransform: 'uppercase',
              }}
              placeholder="e.g. V100"
              value={searchNumber}
              onChange={(e) => setSearchNumber(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCardSearch()}
            />
            <button className="secondary-button" onClick={handleCardSearch} type="button">
              <Search size={15} /> Find Card
            </button>
          </div>
        </article>

        {/* Selected Card Visual Badge */}
        {currentCard ? (
          <div className="gift-card-display">
            <div className="gift-card-display__top">
              <span>✦ Uhaas Beauty Studio</span>
              <span className="gift-card-display__chip">
                {currentCard.status === 'active' ? '● ACTIVE CARD' : 'EXHAUSTED'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 11, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Card Number
              </div>
              <div className="gift-card-display__number">{currentCard.card_number}</div>
            </div>
            <div className="gift-card-display__balance">
              <div>
                <span>Original Value</span>
                <b style={{ fontSize: 13 }}>{formatINR(currentCard.original_value)}</b>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span>Available Balance</span>
                <strong>{formatINR(currentCard.remaining_balance)}</strong>
              </div>
            </div>
          </div>
        ) : (
          <article className="panel" style={{ display: 'grid', placeContent: 'center', textAlign: 'center', padding: 20 }}>
            <AlertCircle size={32} color="#f43f5e" style={{ margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>No gift card currently selected.</p>
          </article>
        )}
      </div>

      <div className="billing-layout">
        <article className="panel bill-builder">
          <div className="panel__header" style={{ padding: '0 0 14px' }}>
            <div>
              <h3>2. Services Provided</h3>
              <p>Add services the customer is receiving</p>
            </div>
          </div>

          <div className="bill-table table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Service</th>
                  <th>Price (₹)</th>
                  <th>Discount (₹)</th>
                  <th>Final price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const calculated = calculateBill([line]).lines[0] || { line_total: 0 }
                  return (
                    <tr key={line.key}>
                      <td>{index + 1}</td>
                      <td>
                        <select
                          aria-label="Select service"
                          value={line.service_id}
                          onChange={(e) => updateLine(line.key, 'service_id', e.target.value)}
                        >
                          <option value="">Custom service</option>
                          {activeServices.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name} (₹{service.default_price})
                            </option>
                          ))}
                        </select>
                        <input
                          className="service-name-input"
                          placeholder="Service name"
                          value={line.name}
                          disabled={Boolean(line.service_id)}
                          onChange={(e) => updateLine(line.key, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={line.unit_price}
                          placeholder="0"
                          disabled={Boolean(line.service_id)}
                          onChange={(e) => updateLine(line.key, 'unit_price', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          value={line.discount}
                          placeholder="0"
                          onChange={(e) => updateLine(line.key, 'discount', e.target.value)}
                        />
                      </td>
                      <td>
                        <b>{formatINR(calculated.line_total)}</b>
                      </td>
                      <td>
                        <button
                          className="row-action row-action--delete"
                          aria-label="Remove service"
                          onClick={() =>
                            setLines((old) => (old.length > 1 ? old.filter((item) => item.key !== line.key) : [emptyLine()]))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <button className="add-row" onClick={() => setLines((old) => [...old, emptyLine()])}>
            <Plus size={16} /> Add another service
          </button>

          {/* REAL-TIME BALANCE CUT BOX AS REQUESTED BY USER */}
          {currentCard && (
            <div className="balance-cut-box">
              <div className="balance-cut-box__title">
                <CheckCircle2 size={17} color="#e11d48" /> Live Card Balance Deduction
              </div>
              <div className="balance-cut-formula">
                <div className="formula-part">
                  <span>Card {currentCard.card_number} Balance</span>
                  <strong>{formatINR(startingBalance)}</strong>
                </div>
                <div className="formula-operator">−</div>
                <div className="formula-part">
                  <span>Services Total</span>
                  <strong>{formatINR(deductedFromCard)}</strong>
                </div>
                <div className="formula-operator">=</div>
                <div className="formula-part formula-result">
                  <span>Remaining Balance in Card</span>
                  <strong>{formatINR(remainingBalanceAfter)}</strong>
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#9f1239', lineHeight: 1.5, marginTop: 8 }}>
                Card <b>{currentCard.card_number}</b> starting balance was <b>{formatINR(startingBalance)}</b>. After taking{' '}
                <b>{formatINR(deductedFromCard)}</b> service, <b>{formatINR(remainingBalanceAfter)}</b> will remain in this card.
                {extraCashNeeded > 0 && (
                  <span style={{ display: 'block', color: '#b91c1c', fontWeight: 700, marginTop: 4 }}>
                    Notice: Services exceed card balance. Customer pays additional {formatINR(extraCashNeeded)} in Cash/UPI.
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="bill-actions">
            <button className="secondary-button" onClick={clearForm}>
              Clear
            </button>
            <button className="primary-button" onClick={handleSaveBill} disabled={saving || !currentCard}>
              {saving ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} Save & Deduct From Card
            </button>
          </div>
        </article>

        {/* Bill Summary */}
        <aside className="bill-summary panel">
          <h3>Gift Card Summary</h3>
          <SummaryRow label="Selected Card" value={currentCard?.card_number || 'None'} strong />
          <SummaryRow label="Current Card Balance" value={formatINR(startingBalance)} />
          <div className="summary-rule" />
          <SummaryRow label="Gross Services" value={formatINR(totals.subtotal)} />
          <SummaryRow label="Discount" value={`− ${formatINR(totals.totalDiscount)}`} soft />
          <SummaryRow label="Net Service Amount" value={formatINR(totals.netAmount)} />
          <div className="summary-rule" />
          <SummaryRow label="Deducted from Card" value={`− ${formatINR(deductedFromCard)}`} soft />
          <SummaryRow label="Remaining Card Balance" value={formatINR(remainingBalanceAfter)} strong />
          <div className="summary-rule" />
          <SummaryRow label="Physical Cash to Collect" value={formatINR(extraCashNeeded)} strong />
          <p className="summary-note">
            The parlour recognizes {formatINR(totals.netAmount)} in service revenue. Card {currentCard?.card_number || 'V100'}{' '}
            will have {formatINR(remainingBalanceAfter)} remaining.
          </p>
        </aside>
      </div>
    </section>
  )
}
