# Fix: S&D Head Can Now Review and Respond to Channel Head Counter-Offers

## Problem
When a Channel Head (BU Head) sent a counter-offer to the S&D Head, clicking "Review →" in the "Waiting for you" section did nothing. The S&D Head couldn't see the editable grid or respond to the counter-offer.

## Root Cause
The SDWorkspace component was missing the Negotiation view for BU (Channel Head) counter-offers. It only showed the regional submission view, which requires both `fFam` and `fReg` to be set.

When reviewing a BU counter-offer:
- ✅ `fFam` (family) was set
- ❌ `fReg` (region) was `null`
- ✅ `fBu` (business unit) was set

But the condition on line 305 was:
```typescript
{fFam && fReg && <SubmittedProductsTable ... />}
```

Since `fReg` was `null` for BU counter-offers, nothing rendered!

## Solution

### 1. Added Negotiation Component to SDWorkspace
**File:** `ui/src/pages/challenge/Workspaces.tsx`

**Changed:**
```typescript
// OLD - Only showed regional submissions
{fFam && fReg && <SubmittedProductsTable month={month} family={fFam} region={fReg} buFilter={fBu} productFilter={fProd} onDone={onDone} />}

// NEW - Shows full Negotiation view for both regions AND BUs
{fFam && (
  <Negotiation
    key={`sd|${fFam}|${fReg}|${fBu}`}
    month={month}
    items={items}
    role="sd"
    region={null}
    unit={null}
    initialFamily={fFam}
    initialRegion={fReg}
    initialBu={fBu}
    productFilter={fProd}
    stamp={stamp}
    onDone={onDone}
  />
)}
```

### 2. Added initialBu Parameter to Negotiation Component
**File:** `ui/src/pages/challenge/Negotiation.tsx`

**Changed:**
```typescript
// OLD
export function Negotiation({ ..., initialRegion, productFilter, ... })

// NEW - Added initialBu parameter
export function Negotiation({ ..., initialRegion, initialBu, productFilter, ... })

// OLD
const [buPick, setBuPick] = useState<string | null>(role === 'bu' ? unit?.bu ?? null : null)

// NEW - Pre-select BU from initialBu prop
const [buPick, setBuPick] = useState<string | null>(initialBu ?? (role === 'bu' ? unit?.bu ?? null : null))
```

### 3. Improved UI Text Clarity
**File:** `ui/src/pages/challenge/Regions.tsx`

**Changed the instruction text** to be more explicit for S&D Head:
```typescript
// OLD
<p className="supporting">
  {role === 'bu' ? 'The S&D Head proposes' : `${b.head} counters with`} {fmtInt(b.proposal)} units. 
  Accept it, or change any lines and counter. Every line needs a number.
</p>

// NEW
<p className="supporting">
  {role === 'bu' ? 'The S&D Head proposes' : `${b.head} counters with`} {fmtInt(b.proposal)} units. 
  {role === 'sd' 
    ? 'You can accept this counter-offer, update the numbers and send your own counter-offer, or make the final call.' 
    : 'Accept it, or change any lines and counter.'
  } Every line needs a number.
</p>
```

**Changed button text** for clarity:
```typescript
// Button now says "Send counter-offer back" for S&D Head
<Button ... onClick={() => send('counter', ...)}>
  {role === 'sd' ? 'Send counter-offer back' : 'Send counter-offer'}
</Button>
```

## What Now Works

When CSD Head (or any BU Head) sends a counter-offer:

1. ✅ S&D Head sees "CSD Head countered Mobile Accessories — 3,661 units" in "Waiting for you"
2. ✅ Clicking "Review →" opens the full negotiation view
3. ✅ S&D Head can see the detailed line-by-line grid
4. ✅ The grid is **editable** (S&D Head can modify values)
5. ✅ S&D Head has three options:
   - **Accept the counter-offer as-is** (button always enabled)
   - **Modify numbers and send a counter-offer back** (requires reason + changes)
   - **Make the final call** (requires reason + changes, S&D only)

## User Flow

```
Channel Head View (BU):
  ├─ Modify values in grid
  ├─ Fill in reason
  └─ Click "Send counter-offer" 
       ↓
S&D Head View:
  ├─ See "CSD Head countered Mobile Accessories — 3,661 units"
  ├─ Click "Review →"
  └─ Negotiation panel opens showing:
       ├─ Editable grid with all line items
       ├─ Reason text field
       └─ Three action buttons:
            ├─ Accept 3,661 units (primary, always enabled)
            ├─ Send counter-offer back (secondary, needs reason + changes)
            └─ Make the final call (danger, S&D only, needs reason + changes)
```

## Testing

To verify the fix:
1. As Channel Head: Send a counter-offer with modified values
2. As S&D Head: Check the "Waiting for you" section
3. Click "Review →" 
4. Confirm you can:
   - See the editable grid
   - Modify values
   - Accept OR counter-offer back OR make final call

## Files Changed

1. ✅ `ui/src/pages/challenge/Workspaces.tsx` - Added Negotiation view to SDWorkspace
2. ✅ `ui/src/pages/challenge/Negotiation.tsx` - Added initialBu parameter
3. ✅ `ui/src/pages/challenge/Regions.tsx` - Improved UI text for S&D Head

