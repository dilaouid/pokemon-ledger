/** Split an indented pixel block into fixed-width rows. Dots are pixels, not spaces. */
export function grid(width: number, height: number, block: string): readonly string[] {
    const rows = block
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (rows.length !== height) {
        throw new Error(`Sprite has ${rows.length} rows, expected ${height}.`);
    }

    rows.forEach((row, index) => {
        if (row.length !== width) {
            throw new Error(`Sprite row ${index} has ${row.length} pixels, expected ${width}: [${row}]`);
        }
    });

    return rows;
}
