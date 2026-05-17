const seeds = new Map();
let counter = 0;

function storeSeed(data) {
    const id = String(++counter);
    seeds.set(id, data);
    setTimeout(() => seeds.delete(id), 10 * 60 * 1000);
    return id;
}

function getSeed(id) {
    return seeds.get(id) ?? null;
}

module.exports = { storeSeed, getSeed };
