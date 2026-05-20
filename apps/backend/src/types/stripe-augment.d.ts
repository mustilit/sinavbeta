/**
 * Stripe SDK v22 exports `StripeConstructor` (callable constructor) via `export =`.
 * With esModuleInterop, `import Stripe from 'stripe'` gives StripeConstructor but its
 * declared namespace only has `{ Stripe }`, missing Event, Checkout, Subscription, etc.
 *
 * This augmentation re-exports the needed namespace members from stripe.core so that
 * `Stripe.Event`, `Stripe.Subscription`, etc. resolve correctly in source files.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Stripe as StripeCore } from 'stripe/cjs/stripe.core';

declare module 'stripe' {
  // Re-export core namespace members into StripeConstructor namespace
  namespace StripeConstructor {
    export type Event = StripeCore.Event;
    export type Checkout = StripeCore.Checkout;
    export type Subscription = StripeCore.Subscription;
    export type Invoice = StripeCore.Invoice;
    export type Price = StripeCore.Price;
    export type Product = StripeCore.Product;
    export type Customer = StripeCore.Customer;
    export type PaymentIntent = StripeCore.PaymentIntent;
    export type Refund = StripeCore.Refund;
    export type Coupon = StripeCore.Coupon;
    export type DiscountCoupon = StripeCore.DeletedCoupon;
  }
}

// Allow `import Stripe from 'stripe'` to be used as a value type in annotations
// by making it compatible with the Stripe class from core.
export {};
