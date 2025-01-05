const TWO_PI = 2 * Math.PI;

/**
 * Computes parameters required to draw an Archimedean spiral.
 * @param {number} r0 - Initial radius of the spiral.
 * @param {number} rInc - Radius increment per turn.
 * @param {number} arcLength - Total arc length of the spiral.
 * @returns {{r0: number, dr_dtheta: number, totalTheta: number}} - Parameters for the spiral.
 */
export function getSpiralParameters(r0, rInc, arcLength) {
    // Differential of radius with respect to theta
    const dr_dtheta = rInc / TWO_PI;

    // Function to compute the arc length element
    function arcLengthElement(theta) {
        const r = r0 + dr_dtheta * theta;
        return Math.sqrt(dr_dtheta ** 2 + r ** 2);
    }

    // Numerical integration using Simpson's Rule
    function integrateSimpson(f, a, b, n = 1000) {
        if (n % 2 !== 0) n++; // Ensure n is even
        const h = (b - a) / n;
        let sum = f(a) + f(b);

        for (let i = 1; i < n; i++) {
            const x = a + i * h;
            sum += (i % 2 === 0 ? 2 : 4) * f(x);
        }

        return (h / 3) * sum;
    }

    // Find the total theta for the given arc length
    function findTheta(targetLength, tolerance = 1e-6) {
        
        const maxLength = targetLength
        let low = 0, high = maxLength

        while (high - low > tolerance) {
            const mid = (low + high) / 2
            const length = integrateSimpson(arcLengthElement, 0, mid)
            if (length < targetLength) {
                low = mid
            } else {
                high = mid
            }
        }

        return (low + high) / 2
    }

    const totalTheta = findTheta(arcLength)

    return {
        r0,
        dr_dtheta,
        totalTheta,
    };
}

/**
 * Computes the (x, y) coordinates of a point on the spiral at a given arc length.
 * @param {{r0: number, dr_dtheta: number, totalTheta: number}} spiralParams - Precomputed spiral parameters.
 * @param {number} s - The distance along the spiral.
 * @returns {{x: number, y: number}} - The Cartesian coordinates of the point.
 */
export function getSpiralCoordinates(spiralParams, theta) {
    const { r0, dr_dtheta, totalTheta } = spiralParams;

    // Compute the radius for the given theta
    const r = r0 + dr_dtheta * theta;

    // Convert polar coordinates (r, theta) to Cartesian coordinates (x, y)
    return {
        x: r * Math.cos(theta) - r0,
        y: r * Math.sin(theta),
    };
}

// Example usage
const r0 = 1;        // Initial radius
const rInc = 0.5;    // Radius increment per turn
const arcLength = 50; // Total arc length of the spiral

// Step 1: Get spiral parameters
const spiralParams = getSpiralParameters(r0, rInc, arcLength);

// Step 2: Get coordinates at a specific distance along the spiral
const s = 20; // Distance along the spiral
const point = getSpiralCoordinates(spiralParams, s);

// console.log(`Spiral Parameters:`, spiralParams);
// console.log(`Point at s=${s}: x=${point.x}, y=${point.y}`);
