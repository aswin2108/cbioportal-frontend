export function toConditionalPrecision(
    number: number,
    precision: number,
    threshold: number
): string {
    if (0.000001 <= number && number < threshold) {
        return number.toExponential(precision);
    } else if (number === 0) {
        return '< 10^-10';
    }

    return number.toPrecision(precision);
}

export function clamp(
    x: number,
    lower_inclusive: number,
    upper_inclusive: number
) {
    return Math.min(upper_inclusive, Math.max(lower_inclusive, x));
}
