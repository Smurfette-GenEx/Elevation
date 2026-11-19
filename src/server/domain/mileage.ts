import { d, roundMoney, type DecimalLike, Decimal } from "./money";

export interface MileageRateRecord {
  vehicleType: string;
  ratePerKm: DecimalLike;
  currency: string;
  validFrom: Date;
  validTo: Date | null;
}

export function findMileageRate(rates: MileageRateRecord[], vehicleType: string, date: Date): MileageRateRecord | undefined {
  return rates
    .filter((r) => r.vehicleType === vehicleType && r.validFrom <= date && (!r.validTo || r.validTo >= date))
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
}

export function mileageAmount(distanceKm: DecimalLike, rate: MileageRateRecord): Decimal {
  const km = d(distanceKm);
  if (km.lessThanOrEqualTo(0)) throw new Error("Distance must be positive");
  if (km.greaterThan(5000)) throw new Error("Distance exceeds the maximum of 5,000 km per claim line");
  return roundMoney(km.times(d(rate.ratePerKm)), rate.currency);
}
