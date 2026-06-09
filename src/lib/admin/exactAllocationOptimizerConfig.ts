export interface ExactAllocationOptimizerConfig {
  capacity: number;
  price: number;
  recommended_minimum_passengers: number;
  maximum_buses: number;
}

const defaultConfig: ExactAllocationOptimizerConfig = {
  capacity: 45,
  price: 0,
  recommended_minimum_passengers: 36,
  maximum_buses: 999,
};

const finiteNumberOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export const normalizeExactAllocationOptimizerConfig = (
  value: unknown,
  fallback: ExactAllocationOptimizerConfig = defaultConfig
): ExactAllocationOptimizerConfig => {
  const config =
    value && typeof value === 'object'
      ? (value as Partial<ExactAllocationOptimizerConfig>)
      : {};

  return {
    capacity: finiteNumberOr(config.capacity, fallback.capacity),
    price: finiteNumberOr(config.price, fallback.price),
    recommended_minimum_passengers: finiteNumberOr(
      config.recommended_minimum_passengers,
      fallback.recommended_minimum_passengers
    ),
    maximum_buses: finiteNumberOr(config.maximum_buses, fallback.maximum_buses),
  };
};
