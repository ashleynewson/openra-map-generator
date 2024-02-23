import Random from './random.js';
import LayeredArray from './layered-array.js';
import PriorityArray from './priority-array.js';
import TileState from './tile-state.js';

window.debugUtils = {
    Random,
};

let ready = false;
let info;
const codeMap = {};

const debugDiv = document.getElementById("debug");

function die(err) {
    const log = document.createElement("pre");
    log.textContent = err;
    log.style.color = "red";
    debugDiv.append(log);
    throw new Error(err);
}

function dump2d(label, data, w, h, points) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w*8}px`;
    canvas.style.height = `${h*8}px`;
    const ctx = canvas.getContext("2d");
    const min = Math.min(...data);
    const max = Math.max(...data);
    const stretch = Math.max(-min, max);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let v = data[y * w + x];
            const r = v < 0 ? (255 * -v / stretch) : 0;
            const g = v > 0 ? (255 * v / stretch) : 0;
            const b = (((x & 4) ^ (y & 4)) ? 1 : 0) * (((x & 16) ^ (y & 16)) ? 96 : 64);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(x, y, 1, 1);
        }
    }
    if (points ?? null !== null) {
        for (let point of points) {
            ctx.fillStyle = point.debugColor ?? "white";
            ctx.beginPath();
            ctx.arc(point.x + 0.5, point.y + 0.5, point.debugRadius ?? 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    const log = document.createElement("pre");
    log.textContent = `${label}: ${w} * ${h}; ${min} to ${max}; ${(points ?? null !== null) ? points.length : "[n/a]"} entities`;
    debugDiv.append(log);
    debugDiv.append(canvas);
}

const DEGREES_0   = 0;
const DEGREES_90  = Math.PI * 0.5;
const DEGREES_180 = Math.PI * 1;
const DEGREES_270 = Math.PI * 1.5;
const DEGREES_360 = Math.PI * 2;
const DEGREES_120 = Math.PI * (2 / 3);
const DEGREES_240 = Math.PI * (4 / 3);

const COS_0   = 1;
const COS_90  = 0;
const COS_180 = -1;
const COS_270 = 0;
const COS_360 = 1;
const COS_120 = -0.5;
const COS_240 = -0.5;

const SIN_0   = 0;
const SIN_90  = 1;
const SIN_180 = 0;
const SIN_270 = -1;
const SIN_360 = 0;
const SIN_120 = 0.86602540378443864676;
const SIN_240 = -0.86602540378443864676;

function cosSnap(angle) {
    switch (angle) {
    case DEGREES_0:   return COS_0;
    case DEGREES_90:  return COS_90;
    case DEGREES_180: return COS_180;
    case DEGREES_270: return COS_270;
    case DEGREES_360: return COS_360;
    case DEGREES_120: return COS_120;
    case DEGREES_240: return COS_240;
    default: return Math.cos(angle);
    }
}
function sinSnap(angle) {
    switch (angle) {
    case DEGREES_0:   return SIN_0;
    case DEGREES_90:  return SIN_90;
    case DEGREES_180: return SIN_180;
    case DEGREES_270: return SIN_270;
    case DEGREES_360: return SIN_360;
    case DEGREES_120: return SIN_120;
    case DEGREES_240: return SIN_240;
    default: return Math.sin(angle);
    }
}

const DIRECTION_R = 0;
const DIRECTION_D = 1;
const DIRECTION_L = 2;
const DIRECTION_U = 3;
const DIRECTION_NONE = -1;

function letterToDirection(letter) {
    switch (letter) {
    case 'R': return DIRECTION_R;
    case 'D': return DIRECTION_D;
    case 'L': return DIRECTION_L;
    case 'U': return DIRECTION_U;
    default: die('Bad direction letter: ' + letter);
    }
}

// Perlin noise may not be the best. It is not isotropic. (It has grid-related artifacts.)
function perlinNoise2d(random, size) {
    const noise = new Float32Array(size * size).fill(0.0);
    const vecX = new Float32Array(size * size);
    const vecY = new Float32Array(size * size);
    // Unit length divided by number of dot products to do.
    const D = 1 / 4;
    for (let y = 0; y <= size; y++) {
        for (let x = 0; x <= size; x++) {
            const phase = 2 * Math.PI * random.f32();
            const vx = Math.cos(phase);
            const vy = Math.sin(phase);
            if (x > 0 && y > 0) {
                noise[(y-1) * size + (x-1)] += vx * -D + vy * -D;
            }
            if (x < size && y > 0) {
                noise[(y-1) * size + (x  )] += vx *  D + vy * -D;
            }
            if (x > 0 && y < size) {
                noise[(y  ) * size + (x-1)] += vx * -D + vy *  D;
            }
            if (x < size && y < size) {
                noise[(y  ) * size + (x  )] += vx *  D + vy *  D;
            }
        }
    }
    return noise;
}

function arrayQuantile (array, q) {
    array.length > 0 || die("Cannot get quantile of empty array");
    let i = q * (array.length - 1);
    if (i < 0) {
        i = 0;
    }
    if (i > array.length - 1) {
        i = array.length - 1;
    }
    const l = i | 0;
    if (l === i) {
        return array[l];
    }
    const u = l + 1;
    const w = i - l;
    const v = array[l] * (1-w) + array[u] * w;
    return v;
};

function interpolate2d(grid, w, h, x, y) {
    let xa = Math.floor(x) | 0;
    let xb = Math.ceil(x) | 0;
    let ya = Math.floor(y) | 0;
    let yb = Math.ceil(y) | 0;
    const xbw = x - xa;
    const ybw = y - ya;
    const xaw = 1.0 - xbw;
    const yaw = 1.0 - ybw;
    if (xa < 0) {
        xa = 0;
        xb = 0;
    } else if (xb > w - 1) {
        xa = w - 1;
        xb = w - 1;
    }
    if (ya < 0) {
        ya = 0;
        yb = 0;
    } else if (yb > w - 1) {
        ya = w - 1;
        yb = w - 1;
    }
    const naa = grid[ya * w + xa];
    const nba = grid[ya * w + xb];
    const nab = grid[yb * w + xa];
    const nbb = grid[yb * w + xb];
    return (naa * xaw + nba * xbw) * yaw + (nab * xaw + nbb * xbw) * ybw;
}

function fractalNoise2d(params) {
    const random = params.random ?? die("need random");
    const size = params.size ?? die("need size");
    // Arguably "feature length"s
    let wavelengths = params.wavelengths;
    if (!wavelengths) {
        wavelengths = new Float32Array(Math.log2(size));
        for (let i = 0; i < wavelengths.length; i++) {
            wavelengths[i] = (1 << i) * (params.wavelengthScale ?? 1.0);
        }
    }
    const amp_func = params.amp_func ?? ((wavelength) => (wavelength / size / wavelengths.length));

    const noise = new Float32Array(size * size).fill(0);
    for (let wavelength of wavelengths) {
        const amps = amp_func(wavelength);
        const sub_size = ((size / wavelength) | 0) + 2;
        const sub_noise = perlinNoise2d(random, sub_size);
        // Offsets should align to grid.
        // (current implementation has bias.)
        const offsetX = (random.f32() * wavelength) | 0;
        const offsetY = (random.f32() * wavelength) | 0;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                noise[y * size + x] += 
                    amps * interpolate2d(sub_noise,
                                         sub_size,
                                         sub_size,
                                         (offsetX + x) / wavelength,
                                         (offsetY + y) / wavelength);
            }
        }
    }

    return noise;
}

function fractalNoise2dWithSymetry(params) {
    const modded_params = Object.assign({}, params);
    // Need higher resolution due to cropping and rotation artifacts
    const size = params.size ?? die("need size");
    const template_size = size * 2 + 2;
    modded_params.size = template_size;
    const template = fractalNoise2d(modded_params);
    const rotations = params.rotations ?? 2;
    let noise = new Float32Array(size * size);
    // This -1 is required to compensate for the top-left vs the center of a grid square 
    const o = (size - 1) / 2;
    const to = template_size / 2;
    if (rotations < 1) {
        die("rotations must be >= 1");
    }
    for (let rotation = 0; rotation < rotations; rotation++) {
        const angle = rotation * 2 * Math.PI / rotations;
        const cos_angle = cosSnap(angle);
        const sin_angle = sinSnap(angle);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                // xy # corner noise space
                // xy - o # middle noise space
                // (xy - o) * Math.SQRT2 # middle temp space
                // R * ((xy - o) * Math.SQRT2) # middle temp space rotate
                // R * ((xy - o) * Math.SQRT2) + to # corner temp space rotate
                const mtx = (x - o) * Math.SQRT2;
                const mty = (y - o) * Math.SQRT2;
                const tx = (mtx * cos_angle - mty * sin_angle) + to;
                const ty = (mtx * sin_angle + mty * cos_angle) + to;
                noise[y * size + x] +=
                    interpolate2d(
                        template,
                        template_size,
                        template_size,
                        tx,
                        ty
                    ) / rotations;
            }
        }
    }
    if ((params.mirror ?? 0) !== 0) {
        const unmirrored = noise;
        noise = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                let tx;
                let ty;
                switch (params.mirror) {
                case 1:
                    tx = x;
                    ty = size - 1 - y;
                    break;
                case 2:
                    tx = y;
                    ty = x;
                    break;
                case 3:
                    tx = size - 1 - x;
                    ty = y;
                    break;
                case 4:
                    tx = size - 1 - y;
                    ty = size - 1 - x;
                    break;
                default:
                    die("bad mirror direction");
                }
                noise[y * size + x] = unmirrored[y * size + x] + unmirrored[ty * size + tx];
            }
        }
    }
    return noise;
}

function terrainColor(terrainType) {
    return ("#" + info.Tileset.Terrain["TerrainType@"+terrainType].Color) ?? die("bad terrain type");
}

function writeU8(buffer, i, value) {
    buffer[i] = value & 0xff;
}
function writeU16(buffer, i, value) {
    buffer[i] = value & 0xff;
    buffer[i+1] = (value >> 8) & 0xff;
}
function writeU32(buffer, i, value) {
    buffer[i] = value & 0xff;
    buffer[i+1] = (value >> 8) & 0xff;
    buffer[i+2] = (value >> 16) & 0xff;
    buffer[i+3] = (value >> 24) & 0xff;
}

function calibrateHeightInPlace(values, target, fraction) {
    const sorted = values.slice().sort();
    // const referencePoint = ((values.length - 1) * fraction) | 0;
    // const adjustment = target - sorted[referencePoint];
    const adjustment = target - arrayQuantile(sorted, fraction);
    for (let i = 0; i < values.length; i++) {
        values[i] += adjustment;
    }
}

function calculateRoominess(elevations, size, roomyEdges) {
    roomyEdges ??= false;
    const roominess = new Int32Array(size * size);
    // This could be more efficient, but this is just a PoC.
    let current = null;
    let next = [];
    // Find shores and map boundary
    for (let cy = 0; cy < size; cy++) {
        for (let cx = 0; cx < size; cx++) {
            let pCount = 0;
            let nCount = 0;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    let x = cx + ox;
                    let y = cy + oy;
                    if (x < 0 || x >= size || y < 0 || y >= size) {
                        // Boundary
                    } else if (elevations[y * size + x] >= 0) {
                        pCount++;
                    } else {
                        nCount++;
                    }
                }
            }
            if (roomyEdges && nCount + pCount !== 9) {
                continue;
            }
            if (pCount !== 9 && nCount !== 9) {
                roominess[cy * size + cx] = (elevations[cy * size + cx] >= 0 ? 1 : -1);
                next.push({x:cx, y:cy});
                // markAt(x, y, 2, next);
            }
        }
    }
    if (next.length === 0) {
        // There were no shores. Use size or -size as appropriate.
        roominess.fill(elevations[0] >= 0 ? size : -size);
        return roominess;
    }
    let distance = 2;
    while (next.length !== 0) {
        current = next;
        next = [];
        for (let point of current) {
            // markAt(point.x, point.y, distance, next);
            let cx = point.x;
            let cy = point.y;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (ox === 0 && oy === 0) {
                        continue;
                    }
                    let x = cx + ox;
                    let y = cy + oy;
                    if (x < 0 || x >= size || y < 0 || y >= size) {
                        continue;
                    }
                    if (roominess[y * size + x] !== 0) {
                        continue;
                    }
                    roominess[y * size + x] = (elevations[y * size + x] >= 0 ? distance : -distance);
                    next.push({x, y});
                }
            }
        }
        distance++;
    }

    return roominess;
}

// Find the (x,y) of one of the roomiest spaces.
function findRandomMax(random, values, size, cap) {
    cap ??= Infinity;
    let candidates = [];
    let best = -Infinity;
    size ?? die("size required");
    for (let i = 0; i < values.length; i++) {
        if (best < cap && values[i] > best) {
            if (values[i] >= cap) {
                best = cap;
            } else {
                best = values[i];
            }
            candidates = [];
        }
        if (values[i] === best) {
            candidates.push(i);
        }
    }
    const choice = random.pick(candidates);
    const y = (choice / size) | 0;
    const x = choice % size;
    return {x, y, value: best};
}

function rotateAndMirror(originals, size, rotations, mirror) {
    const projections = [];
    // This -1 is required to compensate for the top-left vs the center of a grid square.
    const o = (size - 1) / 2;
    if (rotations < 1) {
        die("rotations must be >= 1");
    }
    for (let original of originals) {
        for (let rotation = 0; rotation < rotations; rotation++) {
            const angle = rotation * 2 * Math.PI / rotations;
            const cos_angle = cosSnap(angle);
            const sin_angle = sinSnap(angle);
            const relOrigX = original.x - o;
            const relOrigY = original.y - o;
            const projX = Math.round((relOrigX * cos_angle - relOrigY * sin_angle) + o) | 0;
            const projY = Math.round((relOrigX * sin_angle + relOrigY * cos_angle) + o) | 0;
            if (projX < 0 || projX >= size || projY < 0 || projY >= size) {
                die("Rotation projection is out of bounds. Check rotations setting is acceptable.");
            }
            projections.push(Object.assign({}, original, {x: projX, y: projY, original: original}));

            if (mirror ?? 0 !== 0) {
                let mx;
                let my;
                switch (mirror) {
                case 1:
                    mx = projX;
                    my = size - 1 - projY;
                    break;
                case 2:
                    mx = projY;
                    my = projX;
                    break;
                case 3:
                    mx = size - 1 - projX;
                    my = projY;
                    break;
                case 4:
                    mx = size - 1 - projY;
                    my = size - 1 - projX;
                    break;
                default:
                    die("bad mirror direction");
                }
                projections.push(Object.assign({}, original, {x: mx, y: my, original: original}));
            }
        }
    }
    return projections;
}

function calculateSpawnPreferences(roominess, size, centralReservation, spawnRegionSize, mirror) {
    const preferences = roominess.map(r => Math.min(r, spawnRegionSize));
    const centralReservationSq = centralReservation * centralReservation;
    
    // This -1 is required to compensate for the top-left vs the center of a grid square.
    const o = (size - 1) / 2;

    // Mark areas close to the center or mirror lines as last resort.
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (preferences[y * size + x] <= 1) {
                continue;
            }
            if (mirror ?? 0 !== 0) {
                switch (mirror) {
                case 1:
                    if (Math.abs(y - o) <= centralReservation) {
                        preferences[y * size + x] = 1;
                    }
                    break;
                case 2:
                    if (Math.abs(x - y) <= centralReservation * Math.SQRT2) {
                        preferences[y * size + x] = 1;
                    }
                    break;
                case 3:
                    if (Math.abs(x - o) <= centralReservation) {
                        preferences[y * size + x] = 1;
                    }
                    break;
                case 4:
                    if (Math.abs((size - 1 - x) - y) <= centralReservation * Math.SQRT2) {
                        preferences[y * size + x] = 1;
                    }
                    break;
                default:
                    die("bad mirror direction");
                }
            } else {
                const rx = x - o;
                const ry = y - o;
                if (rx*rx + ry*ry <= centralReservationSq) {
                    preferences[y * size + x] = 1;
                }
            }
        }
    }

    return preferences;
}

function reserveCircleInPlace(grid, size, cx, cy, r, setTo) {
    let minX = cx - r;
    let minY = cy - r;
    let maxX = cx + r;
    let maxY = cy + r;
    if (minX < 0) { minX = 0; }
    if (minY < 0) { minX = 0; }
    if (maxX >= size) { maxX = size - 1; }
    if (maxY >= size) { maxY = size - 1; }
    const rSq = r * r;
    for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
            const rx = x - cx;
            const ry = y - cy;
            const thisRSq = rx*rx + ry*ry;
            if (rx*rx + ry*ry <= rSq) {
                if (typeof(setTo) === "function") {
                    grid[y * size + x] = setTo(thisRSq, grid[y * size + x]);
                } else {
                    grid[y * size + x] = setTo;
                }
            }
        }
    }
}

function zoneColor(type) {
    switch(type) {
    case "mine":
        return "orange";
    case "rock":
        return "brown";
    default:
        die(`unknown zone type "${type}"`);
    }
}

function generateFeatureRing(random, location, type, radius1, radius2, params) {
    radius1 ?? die("bad radius1");
    Number.isNaN(radius1) && die("radius1 is NaN");
    radius2 ?? die("bad radius2");
    Number.isNaN(radius2) && die("radius2 is NaN");
    const features = [];
    const ring = [];
    const radius = (radius1 + radius2) / 2;
    const circumference = (radius * Math.PI * 2);
    let ringBudget = circumference | 0;
    switch (type) {
    case "spawn":
        for (let i = 0; i < params.spawnMines; i++) {
            const feature = {
                type: "mine",
                radius: params.spawnOre,
                size: params.spawnOre * 2 - 1,
            };
            ring.push(feature);
            ringBudget -= feature.size;
        }
        break;
    case "expansion":
        const mines = 1 + ((random.f32() * circumference * params.expansionMines) | 0);
        for (let i = 0; i < mines && ringBudget > 0; i++) {
            const radius = (random.f32() * params.expansionOre) | 0;
            const feature = {
                type: "mine",
                radius,
                size: radius * 2 - 1,
            };
            ring.push(feature);
            ringBudget -= feature.size;
        }
        break;
    case "empty":
        break;
    default:
        die("Bad feature ring type");
    }
    {
        const rocks = (random.f32() * circumference * params.rockWeight) | 0;
        for (let i = 0; i < rocks && ringBudget >= params.rockSize; i++) {
            const radius = 4 + (random.f32() * params.rockSize) | 0;
            const feature = {
                type: "rock",
                radius,
                size: radius * 2 - 1,
            };
            ring.push(feature);
            ringBudget -= feature.size;
        }
    }
    while (ringBudget > 0) {
        const feature = {
            type: "spacer",
            radius: 1,
            size: 1,
        };
        ring.push(feature);
        ringBudget -= feature.size;
    }

    random.shuffleInPlace(ring);
    // The feature list always starts on a boundary, so avoid that
    // bias by using a random start angle.
    let angle = random.f32() * Math.PI * 2;
    let anglePerUnit = Math.PI * 2 / circumference;
    for (let feature of ring) {
        switch (feature.type) {
        case "spacer":
            angle += feature.radius * anglePerUnit;
            break;
        case "mine":
            {
                angle += feature.radius * anglePerUnit;
                // This may create an inward density bias.
                const r =
                      radius2 - radius1 <= feature.size
                      ? (radius1 + radius2) / 2
                      : feature.radius + radius1 + random.f32() * (radius2 - radius1 - feature.radius * 2);
                const rx = r * Math.cos(angle);
                const ry = r * Math.sin(angle);
                features.push({
                    x: Math.round(location.x + rx) | 0,
                    y: Math.round(location.y + ry) | 0,
                    type: feature.type,
                    radius: feature.radius,
                    debugRadius: feature.radius,
                    debugColor: zoneColor(feature.type),
                });
                angle += (feature.radius - 1) * anglePerUnit;
            }
            break;
        case "rock":
            {
                const r =
                      radius2 - radius1 <= feature.size
                      ? (radius1 + radius2) / 2
                      : feature.radius + radius1 + random.f32() * (radius2 - radius1 - feature.radius * 2);
                angle += anglePerUnit * 2;
                for (let i = 2; i < feature.size - 2; i++) {
                    const rx = r * Math.cos(angle);
                    const ry = r * Math.sin(angle);
                    features.push({
                        x: Math.round(location.x + rx) | 0,
                        y: Math.round(location.y + ry) | 0,
                        type: feature.type,
                        radius: 1,
                        debugRadius: 1,
                        debugColor: zoneColor(feature.type),
                    });
                    angle += anglePerUnit;
                }
                angle += anglePerUnit * 2;
            }
            break;
        }
    }
    return features;
}

function medianBlur(input, size, radius, extendOut, threshold) {
    extendOut ??= false;
    const halfThreshold = (threshold ?? 0) / 2;
    const output = new Float32Array(size * size);
    let changes = 0;
    let signChanges = 0;
    for (let cy = 0; cy < size; cy++) {
        for (let cx = 0; cx < size; cx++) {
            const ci = cy * size + cx;
            const values = [];
            for (let oy = -radius; oy <= radius; oy++) {
                for (let ox = -radius; ox <= radius; ox++) {
                    let x = cx + ox;
                    let y = cy + oy;
                    if (extendOut) {
                        if (x >= size) x = size - 1;
                        if (x < 0) x = 0;
                        if (y >= size) y = size - 1;
                        if (y < 0) y = 0;
                    } else {
                        if (x < 0 || x >= size || y < 0 || y >= size) {
                            continue;
                        }
                    }
                    const i = y * size + x;
                    values.push(input[i]);
                }
            }
            values.sort((a, b) => (a - b));
            if (threshold !== 0) {
                const l = arrayQuantile(values, 0.5 - halfThreshold);
                const u = arrayQuantile(values, 0.5 + halfThreshold);
                if (l <= input[ci] && input[ci] <= u) {
                    output[ci] = input[ci];
                    continue;
                }
            }
            output[ci] = arrayQuantile(values, 0.5);
            changes++;
            if (Math.sign(output[ci]) !== Math.sign(input[ci])) {
                signChanges++;
            }
        }
    }
    return [output, changes, signChanges];
}

function erodeAndDilate(input, size, foregroundLand, width) {
    const foreground = foregroundLand ? 1 : -1;
    const output = new Float32Array(size * size).fill(foregroundLand ? -1 : 1);
    const sizeM1 = size - 1;
    for (let cy = 1 - width; cy < size; cy++) {
        center: for (let cx = 1 - width; cx < size; cx++) {
            for (let ry = 0; ry < width; ry++) {
                for (let rx = 0; rx < width; rx++) {
                    const x = cx + rx;
                    const y = cy + ry;
                    if (x < 0 || x >= size || y < 0 || y >= size) {
                        continue;
                    }
                    if ((input[y * size + x] >= 0) !== foregroundLand) {
                        continue center;
                    }
                }
            }
            for (let ry = 0; ry < width; ry++) {
                for (let rx = 0; rx < width; rx++) {
                    const x = cx + rx;
                    const y = cy + ry;
                    if (x < 0 || x >= size || y < 0 || y >= size) {
                        continue;
                    }
                    output[y * size + x] = foreground;
                }
            }
        }
    }
    
    let changes = 0;
    for (let i = 0; i < input.length; i++) {
        if ((input[i] >= 0) !== (output[i] >= 0)) {
            changes++;
        }
    }
    return [output, changes];
}

function fixThinMassesInPlace(input, size, growLand, width) {
    const grow = growLand ? 1 : -1;
    const sizeM1 = size - 1;
    const cornerMaskSize = width + 1;
    // Zero means ignore.
    const cornerMask = new Uint32Array(cornerMaskSize * cornerMaskSize);

    // Diagonal steps cause problems for template path laying loop shortcuts. Disabled.
    const allowDiagonalSteps = false;
    for (let y = 0; y < cornerMaskSize; y++) {
        for (let x = 0; x < cornerMaskSize; x++) {
            cornerMask[y * cornerMaskSize + x] = (allowDiagonalSteps ? 0 : 1) + width + width - x - y;
        }
    }
    cornerMask[0] = 0;

    // Higher number indicates a thinner area.
    const thinness = new Uint32Array(size * size);
    const setThinness = function(x, y, v) {
        if (x < 0 || x >= size || y < 0 || y >= size) {
            return;
        }
        if ((input[y * size + x] >= 0) === growLand) {
            return;
        }
        thinness[y * size + x] = Math.max(v, thinness[y * size + x]);
    };
    for (let cy = 0; cy < size; cy++) {
        for (let cx = 0; cx < size; cx++) {
            if ((input[cy * size + cx] >= 0) === growLand) {
                // This isn't coastline.
                continue;
            }
            const l = (input[cy * size + Math.max(cx - 1, 0)] >= 0) === growLand;
            const r = (input[cy * size + Math.min(cx + 1, sizeM1)] >= 0) === growLand;
            const u = (input[Math.max(cy - 1, 0) * size + cx] >= 0) === growLand;
            const d = (input[Math.min(cy + 1, sizeM1) * size + cx] >= 0) === growLand;
            const lu = l && u;
            const ru = r && u;
            const ld = l && d;
            const rd = r && d;
            for (let ry = 0; ry < cornerMaskSize; ry++) {
                for (let rx = 0; rx < cornerMaskSize; rx++) {
                    if (rd) {
                        const x = cx + rx;
                        const y = cy + ry;
                        setThinness(x, y, cornerMask[ry * cornerMaskSize + rx]);
                    }
                    if (ru) {
                        const x = cx + rx;
                        const y = cy - ry;
                        setThinness(x, y, cornerMask[ry * cornerMaskSize + rx]);
                    }
                    if (ld) {
                        const x = cx - rx;
                        const y = cy + ry;
                        setThinness(x, y, cornerMask[ry * cornerMaskSize + rx]);
                    }
                    if (lu) {
                        const x = cx - rx;
                        const y = cy - ry;
                        setThinness(x, y, cornerMask[ry * cornerMaskSize + rx]);
                    }
                }
            }
        }
    }

    const thinnest = Math.max(...thinness);
    if (thinnest === 0) {
        // No fixes
        return [0, 0];
    }
    
    let changes = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (thinness[i] === thinnest) {
                input[i] = grow;
                changes++;
            }
        }
    }

    // Fixes made, with potentially more that can be in another pass.
    return [thinnest, changes];
}

function fixThinMassesInPlaceFull(input, size, growLand, width) {
    let thinnest;
    let changes;
    let changesAcc;
    [thinnest, changes] = fixThinMassesInPlace(input, size, growLand, width);
    changesAcc = changes;
    while (changes > 0) {
        [, changes] = fixThinMassesInPlace(input, size, growLand, width);
        changesAcc += changes;
    }
    return [thinnest, changesAcc];
}

// DEPRECATED
// This method doesn't work very well and isn't generalized
function fixThinMassesOld(input, size, growLand, radius) {
    // TODO: Sweep with given radius.
    // (algorithm not planned!)
    let signChanges = 0;
    const sweep = [
        [-1, -1],
        [ 0, -1],
        [ 1, -1],
        [ 1,  0],
        [ 1,  1],
        [ 0,  1],
        [-1,  1],
        [-1,  0],
    ];
    const output = input.slice();
    let changes = 0;
    for (let cy = 0; cy < size; cy++) {
        for (let cx = 0; cx < size; cx++) {
            const ci = cy * size + cx;
            const cv = input[ci] >= 0 ? true : false;
            if (cv !== growLand) {
                continue;
            }
            // Array not strictly needed. Can be done in one pass.
            const values = [];
            let sameCount = 0;
            for (const [ox, oy] of sweep) {
                let x = cx + ox;
                let y = cy + oy;
                if (x >= size) x = size - 1;
                if (x < 0) x = 0;
                if (y >= size) y = size - 1;
                if (y < 0) y = 0;
                const i = y * size + x;
                const v = input[i] >= 0 ? true : false;
                if (v === cv) {
                    sameCount++;
                }
                values.push(v);
            }
            if (sameCount >= 3) {
                let edges = 0;
                let last = values[values.length - 1];
                for (const curr of values) {
                    if (curr !== last) {
                        edges++;
                    }
                    last = curr;
                }
                if (edges <= 2) {
                    // thick
                    continue;
                }
            }
            // thin
            changes++;
            for (let oy = -radius; oy <= radius; oy++) {
                for (let ox = -radius; ox <= radius; ox++) {
                    let x = cx + ox;
                    let y = cy + oy;
                    if (x < 0 || x >= size || y < 0 || y >= size) {
                        continue;
                    }
                    const i = y * size + x;
                    output[i] = input[ci];
                }
            }
        }
    }
    return [output, changes];
}

function collapseTiles(biases, size, params) {
    // TODO: make progress a measure of priority?
    const maxProgress = size * size;
    const committed = new TileState(size);
    for (let i = 0; i < committed.priorities.length; i++) {
        const y = (i / size) | 0;
        const x = i % size;
        committed.updatePriorityAt(x, y, biases, info);
    }
    dump2d("priority", committed.priorities.priorities, size, size);
    // for (
    //     let i = committed.priorities.getMaxIndex();
    //     committed.priorities.get(i) < Infinity;
    //     i = committed.priorities.getMaxIndex()
    // ) {
    //     const y = i / size;
    //     const x = i % size;
    //     // Create list of candidates
    //     if (committed.candidates === null) {
    //         committed.candidates = [];
    //         for (const tiIndex in info.TileInfo) {
    //             if (!Object.hasOwn(info.TileInfo, tiIndex)) {
    //                 continue;
    //             }
    //             const candidate = {
    //                 tiles: 
    //             }
    //             committed.candidates.push(candidate);
    //         }
    //     }
    //     // Theorize about candidates

    //     // Find best candidate
    //     const best = ...;
    //     // Merge candidate to committed
    //     committed.progress = best.progress;
    //     committed.error = best.error;
    //     committed.priorities = best.priorities;
    //     best.tiles.merge();
    //     best.hEdges.merge();
    //     best.vEdges.merge();
    //     committed.candidates = best.candidates;
    //     for (const candidate of committed.candidates) {
    //         candidate.tiles.rebase(committed.tiles);
    //         candidate.hEdges.rebase(committed.hEdges);
    //         candidate.vEdges.rebase(committed.vEdges);
    //     }
    // }
    let depth = 0;
    while (committed.progress < /*maxProgress*/100) {
        committed.search(4, maxProgress, biases, info);
        const best = committed.candidates[0];
        best ?? die("no candidate, but not finished?");
        console.debug(best.tiles.over);
        best.commit();
        depth++;
        console.log(`depth: ${depth}, progress: ${committed.progress}; error: ${committed.error}`);
    }
    console.debug(committed);
    return committed.tiles;
}

function zip2(a, b, f) {
    a.length === b.length || die("arrays do not have equal length");
    const c = a.slice();
    for (let i = 0; i < c.length; i++) {
        c[i] = f(a[i], b[i], i);
    }
    return c;
}

function detectCoastlines(elevation, size) {
    // There is redundant memory/iteration, but I don't care enough.
    const coastlineH = new Int8Array(size * size);
    const coastlineV = new Int8Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 1; x < size; x++) {
            const i = y * size + x;
            const l = elevation[i-1] >= 0 ? 1 : 0;
            const r = elevation[i] >= 0 ? 1 : 0;
            coastlineV[i] = r - l;
        }
    }
    for (let y = 1; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            const u = elevation[i-size] >= 0 ? 1 : 0;
            const d = elevation[i] >= 0 ? 1 : 0;
            coastlineH[i] = d - u;
        }
    }

    // Looping coastlines contain the start/end point twice.
    const coastlines = [];
    const traceCoast = function(sx, sy, direction) {
        const points = [];
        let x = sx;
        let y = sy;
        points.push({x, y});
        do {
            switch (direction) {
            case DIRECTION_R:
                coastlineH[y * size + x] = 0;
                x++;
                break;
            case DIRECTION_D:
                coastlineV[y * size + x] = 0;
                y++;
                break;
            case DIRECTION_L:
                x--;
                coastlineH[y * size + x] = 0;
                break;
            case DIRECTION_U:
                y--;
                coastlineV[y * size + x] = 0;
                break;
            }
            points.push({x, y});
            const i = y * size + x;
            const r = x < size && coastlineH[i] > 0;
            const d = y < size && coastlineV[i] < 0;
            const l = x > 0 && coastlineH[i - 1] < 0;
            const u = y > 0 && coastlineV[i - size] > 0;
            if (direction == DIRECTION_R && u) {
                direction = DIRECTION_U;
            } else if (direction == DIRECTION_D && r) {
                direction = DIRECTION_R;
            } else if (direction == DIRECTION_L && d) {
                direction = DIRECTION_D;
            } else if (direction == DIRECTION_U && l) {
                direction = DIRECTION_L;
            } else if (r) {
                direction = DIRECTION_R;
            } else if (d) {
                direction = DIRECTION_D;
            } else if (l) {
                direction = DIRECTION_L;
            } else if (u) {
                direction = DIRECTION_U;
            } else {
                // Dead end (not a loop)
                break;
            }
        } while (x != sx || y != sy);
        coastlines.push(points);
    };
    // Trace non-loops (from edge of map)
    for (let n = 1; n < size; n++) {
        {
            const x = n;
            const y = 0;
            if (coastlineV[y * size + x] < 0) {
                traceCoast(x, y, DIRECTION_D);
            }
        }
        {
            const x = n;
            const y = size - 1;
            if (coastlineV[y * size + x] > 0) {
                traceCoast(x, y+1, DIRECTION_U);
            }
        }
        {
            const x = 0;
            const y = n;
            if (coastlineH[y * size + x] > 0) {
                traceCoast(x, y, DIRECTION_R);
            }
        }
        {
            const x = size - 1;
            const y = n;
            if (coastlineH[y * size + x] < 0) {
                traceCoast(x+1, y, DIRECTION_L);
            }
        }
    }
    // Trace loops
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (coastlineH[i] > 0) {
                traceCoast(x, y, DIRECTION_R);
            } else if (coastlineH[i] < 0) {
                traceCoast(x+1, y, DIRECTION_L);
            }
            if (coastlineV[i] < 0) {
                traceCoast(x, y, DIRECTION_D);
            } else if (coastlineV[i] > 0) {
                traceCoast(x, y+1, DIRECTION_U);
            }
        }
    }

    return coastlines;
}

function tweakCoastlines(coastlines, size) {
    size ?? die("need size");
    const tweakedCoastlines = [];
    for (const coastline of coastlines) {
        const len = coastline.length;
        const lst = len - 1;
        if (coastline[0].x === coastline[lst].x && coastline[0].y === coastline[lst].y) {
            // Closed loop. Find the longest straight
            // (nrlen excludes the repeated point at the end.)
            const nrlen = len - 1;
            let prevDim = -1;
            let scanStart = -1;
            let bestScore = -1;
            let bestBend = -1;
            let prevBend = -1;
            let prevI = 0;
            for (let i = 1;; i++) {
                if (i === nrlen) {
                    i = 0;
                }
                const dim = coastline[i].x === coastline[prevI].x ? 1 : 0;
                if (prevDim !== -1 && prevDim !== dim) {
                    if (scanStart === -1) {
                        // This is technically just after the bend. But that's fine.
                        scanStart = i;
                    } else {
                        let score = prevI - prevBend;
                        if (score < 0) {
                            score += nrlen;
                        }
                        if (score > bestScore) {
                            bestBend = prevBend;
                            bestScore = score;
                        }
                        if (i === scanStart) {
                            break;
                        }
                    }
                    prevBend = prevI;
                }
                prevDim = dim;
                prevI = i;
            }
            const favouritePoint = (bestBend + (bestScore >> 1)) % nrlen;
            // Repeat the start at the end.
            tweakedCoastlines.push([...coastline.slice(favouritePoint, nrlen), ...coastline.slice(0, favouritePoint + 1)]);
        } else {
            const extend = function(point, extensionLength) {
                const ox = (point.x === 0)    ? -1
                         : (point.x === size) ?  1
                         : 0;
                const oy = (point.y === 0)    ? -1
                         : (point.y === size) ?  1
                         : 0;
                const extension = [];
                let newPoint = point;
                for (let i = 0; i < extensionLength; i++) {
                    newPoint = {x: newPoint.x + ox, y: newPoint.y + oy};
                    extension.push(newPoint);
                }
                return extension;
            };
            // Open paths. Extend to edges.
            const startExt = extend(coastline[0], /*extensionLength=*/4).reverse();
            const endExt = extend(coastline[lst], /*extensionLength=*/4);
            tweakedCoastlines.push([...startExt, ...coastline, ...endExt]);
        }
    }
    return tweakedCoastlines;
}

function calculateDirection(now, next) {
    const dx = next.x - now.x;
    const dy = next.y - now.y;
    if (dx > 0) {
        return DIRECTION_R;
    } else if (dx < 0) {
        return DIRECTION_L;
    }
    if (dy > 0) {
        return DIRECTION_D;
    } else if (dy < 0) {
        return DIRECTION_U;
    }
    die("Bad direction");
}

function paintTemplate(tiles, size, px, py, template) {
    for (let ty = 0; ty < template.SizeY; ty++) {
        for (let tx = 0; tx < template.SizeX; tx++) {
            const x = px + tx;
            const y = py + ty;
            if (x < 0 || x >= size || y < 0 || y >= size) {
                continue;
            }
            const ti = ty * template.SizeX + tx;
            if (typeof(template.Tiles[ti]) === "undefined") {
                continue;
            }
            const i = y * size + x;
            tiles[i] = `t${template.Id}i${ti}`;
        }
    }
}

function tileCoastline(tiles, tilesSize, coastline, random, params) {
    let minPointX = Infinity;
    let minPointY = Infinity;
    let maxPointX = -Infinity;
    let maxPointY = -Infinity;
    for (const point of coastline) {
        if (point.x < minPointX) {
            minPointX = point.x;
        }
        if (point.y < minPointY) {
            minPointY = point.y;
        }
        if (point.x > maxPointX) {
            maxPointX = point.x;
        }
        if (point.y > maxPointY) {
            maxPointY = point.y;
        }
    }
    const maxDeviation = (params.minimumThickness - 1) >> 1;
    minPointX -= maxDeviation;
    minPointY -= maxDeviation;
    maxPointX += maxDeviation;
    maxPointY += maxDeviation;
    coastline = coastline.map(point => ({x: point.x - minPointX, y: point.y - minPointY}));

    const isLoop =
          coastline[0].x === coastline[coastline.length-1].x &&
          coastline[0].y === coastline[coastline.length-1].y;

    // grid points (not squares)
    const sizeX = 1 + maxPointX - minPointX;
    const sizeY = 1 + maxPointY - minPointY;
    const directions = new Uint8Array(sizeX * sizeY).fill(0);
    const deviations = new Uint32Array(sizeX * sizeY).fill(0x7fffffff);
    const traversables = new Uint8Array(sizeX * sizeY).fill(0);
    for (let deviation = 0; deviation <= maxDeviation; deviation++) {
        for (let pointI = 0; pointI < coastline.length; pointI++) {
            const point = coastline[pointI];
            let direction_mask;
            if (pointI + 1 < coastline.length) {
                const pointNext = coastline[pointI + 1];
                direction_mask = 1 << calculateDirection(point, pointNext);
            } else if (isLoop) {
                break;
            } else {
                const pointPrev = coastline[pointI - 1];
                direction_mask = 1 << calculateDirection(pointPrev, point);
            }
            const minX = point.x - deviation;
            const minY = point.y - deviation;
            const maxX = point.x + deviation;
            const maxY = point.y + deviation;
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const i = y * sizeX + x;
                    if (deviations[i] === 0x7fffffff) {
                        deviations[i] = deviation;
                    }
                    directions[i] |= direction_mask;
                    if (x > minX) {
                        traversables[i] |= 1 << DIRECTION_L;
                    }
                    if (x < maxX) {
                        traversables[i] |= 1 << DIRECTION_R;
                    }
                    if (y > minY) {
                        traversables[i] |= 1 << DIRECTION_U;
                    }
                    if (y < maxY) {
                        traversables[i] |= 1 << DIRECTION_D;
                    }
                }
            }
        }
    }

    const templatesByStartDir = info.templatesByStartDir;
    const templatesByEndDir = info.templatesByEndDir;
    const priorities = new PriorityArray(4 * sizeX * sizeY).fill(-Infinity);
    const SCORE_MAX = 0x7fffffff; // Not 0xffffffff?
    const scores = new Uint32Array(4 * sizeX * sizeY).fill(SCORE_MAX);

    // Assumes both f and t are in the sizeX/sizeY bounds.
    const scoreTemplate = function(template, fx, fy) {
        let deviationAcc = 0;
        let progressionAcc = 0;
        const lastPointI = template.RelPathND.length - 1;
        for (let pointI = 0; pointI <= lastPointI; pointI++) {
            const point = template.RelPathND[pointI];
            const px = fx + point.x;
            const py = fy + point.y;
            const pi = py * sizeX + px;
            if (px < 0 || px >= sizeX || py < 0 || py >= sizeY) {
                // Intermediate point escapes array bounds.
                return SCORE_MAX;
            }
            if (pointI < lastPointI) {
                if ((traversables[pi] & point.dm) === 0) {
                    // Next point escapes traversable area.
                    return SCORE_MAX;
                }
                if ((directions[pi] & point.dm) === point.dm) {
                    progressionAcc++;
                } else if ((directions[pi] & point.dmr) === point.dmr) {
                    progressionAcc--;
                }
            }
            if (pointI > 0) {
                // Don't double-count the template's path's starts and ends
                deviationAcc += deviations[pi];
            }
        }
        if (progressionAcc < 0) {
            // It's moved backwards
            return SCORE_MAX;
        }
        // Satisfies all requirements.
        return deviationAcc;
    }

    const updateFrom = function(fx, fy, fd) {
        const fi = fy * sizeX + fx;
        const fid = 4 * fi + fd;
        const fscore = scores[fid];
        template_loop: for (const template of templatesByStartDir[fd]) {
            const tx = fx + template.MovesX;
            const ty = fy + template.MovesY;
            const ti = ty * sizeX + tx;
            if (tx < 0 || tx >= sizeX || ty < 0 || ty >= sizeY) {
                continue template_loop;
            }
            // Most likely to fail. Check first.
            if (deviations[ti] === 0x7fffffff) {
                // End escapes bounds.
                continue template_loop;
            }

            const templateScore = scoreTemplate(template, fx, fy);
            if (templateScore === SCORE_MAX) {
                continue template_loop;
            }

            const tscore = fscore + templateScore;
            const tid = ti * 4 + template.EndDir;
            if (tscore < scores[tid]) {
                scores[tid] = tscore;
                priorities.set(tid, -tscore);
            }
        }
        priorities.set(fid, -Infinity);
    };

    const sx = coastline[0].x;
    const sy = coastline[0].y;
    const si = sy * sizeX + sx;
    const sd = calculateDirection(coastline[0], coastline[1]);
    const sid = 4 * si + sd
    {
        scores[sid] = 0;
        updateFrom(sx, sy, sd);
        // Needed in case we loop back to the start.
        scores[sid] = SCORE_MAX;
    }
    for (;;) {
        const fid = priorities.getMaxIndex() | 0;
        if (priorities.get(fid) === -Infinity) {
            break;
        }
        const fd = fid & 0b11;
        const fi = fid >> 2;
        const fy = (fi / sizeX) | 0;
        const fx = (fi % sizeX) | 0;
        updateFrom(fx, fy, fd);
    }

    const traceBackStep = function(tx, ty, td) {
        const ti = ty * sizeX + tx;
        const tid = 4 * ti + td;
        const tscore = scores[tid];
        const candidates = [];
        template_loop: for (const template of templatesByEndDir[td]) {
            const fx = tx - template.MovesX;
            const fy = ty - template.MovesY;
            const fi = fy * sizeX + fx;
            if (fx < 0 || fx >= sizeX || fy < 0 || fy >= sizeY) {
                continue template_loop;
            }
            // Most likely to fail. Check first.
            if (deviations[fi] === 0x7fffffff) {
                // Start escapes bounds.
                continue template_loop;
            }

            const templateScore = scoreTemplate(template, fx, fy);
            if (templateScore === SCORE_MAX) {
                continue template_loop;
            }

            const fscore = tscore - templateScore;
            const fid = fi * 4 + template.StartDir;
            if (fscore === scores[fid]) {
                candidates.push(template);
            }
        }
        candidates.length >= 1 || die("Assertion failure");
        const template = random.pick(candidates);
        const fx = tx - template.MovesX;
        const fy = ty - template.MovesY;
        const templateInfo = info.Tileset.Templates[template.Name];
        paintTemplate(tiles, tilesSize, fx - template.OffsetX + minPointX, fy - template.OffsetY + minPointY, templateInfo);
        // console.log(`chose ${template.Name} at ${fx}, ${fy}`);
        return {
            x: fx,
            y: fy,
            d: template.StartDir,
        };
    };
    // console.log(`---`);

    // { // DEBUG
    //     const debugArray = new Int32Array(sizeX * sizeY);
    //     for (let d = 0; d < 4; d++) {
    //         for (let i = 0; i < debugArray.length; i++) {
    //             debugArray[i] = scores[i * 4 + d];
    //             if (debugArray[i] === SCORE_MAX) debugArray[i] = -1;
    //         }
    //         dump2d(`d${d}`, debugArray, sizeX, sizeY);
    //     }
    //     for (let i = 0; i < debugArray.length; i++) {
    //         debugArray[i] = Math.min(scores[i * 4], scores[i * 4 + 1], scores[i * 4 + 2], scores[i * 4 + 3]);
    //         if (debugArray[i] === SCORE_MAX) debugArray[i] = -1;
    //     }
    //     dump2d("max", debugArray, sizeX, sizeY);
    //     dump2d("deviations", deviations.map(x => (x === SCORE_MAX ? 0 : x)), sizeX, sizeY);
    //     dump2d("directionsR", directions.map(x => (x & (1 << DIRECTION_R))), sizeX, sizeY);
    //     dump2d("directionsD", directions.map(x => (x & (1 << DIRECTION_D))), sizeX, sizeY);
    //     dump2d("directionsL", directions.map(x => (x & (1 << DIRECTION_L))), sizeX, sizeY);
    //     dump2d("directionsU", directions.map(x => (x & (1 << DIRECTION_U))), sizeX, sizeY);
    //     dump2d("traversablesR", traversables.map(x => (x & (1 << DIRECTION_R))), sizeX, sizeY);
    //     dump2d("traversablesD", traversables.map(x => (x & (1 << DIRECTION_D))), sizeX, sizeY);
    //     dump2d("traversablesL", traversables.map(x => (x & (1 << DIRECTION_L))), sizeX, sizeY);
    //     dump2d("traversablesU", traversables.map(x => (x & (1 << DIRECTION_U))), sizeX, sizeY);
    // }

    // Trace back and update tiles
    {
        let tx = coastline[coastline.length-1].x;
        let ty = coastline[coastline.length-1].y;
        let td;
        if (isLoop) {
            td = calculateDirection(coastline[0], coastline[1]);
        } else {
            td = calculateDirection(coastline[coastline.length-2], coastline[coastline.length-1]);
        }
        let ti = ty * sizeX + tx;
        let tid = 4 * ti + td;
        if (scores[tid] === SCORE_MAX) {
            die("Could not fit tiles for coastline");
        }
        let p = traceBackStep(tx, ty, td);
        // We set this to SCORE_MAX in case we were a loop. Reset it for getting back to the start.
        scores[sid] = 0;
        // No need to check direction. If that is an issue, I have bigger problems to worry about.
        while (p.x !== sx || p.y !== sy) {
            p = traceBackStep(p.x, p.y, p.d);
        }
    }
}

function generateMap(params) {
    const size = params.size ?? die("need size");

    // Terrain generation
    const water = params.water ?? die("need water");
    if (water < 0.0 || water > 1.0) {
        die("water must be between 0 and 1 inclusive");
    }
    const random = new Random(params.seed);
    let elevation = fractalNoise2dWithSymetry({
        random,
        size,
        rotations: params.rotations,
        mirror: params.mirror,
        wavelengthScale: (params.wavelengthScale ?? 1.0),
    });
    {
        const min = Math.min(...elevation);
        dump2d("uncalibrated terrain (zero-rebased)", elevation.map(v => v-min), size, size);
    }
    calibrateHeightInPlace(
        elevation,
        0.0,
        water,
    );
    {
        dump2d("calibrated terrain", elevation, size, size);
    }
    // Make height discrete -1 and 1.
    elevation = elevation.map(v => (v >= 0 ? 1 : -1));
    dump2d("unsmoothed terrain", elevation.map(v=>Math.sign(v)), size, size);
    // Primary smoothing
    [elevation, ] = medianBlur(elevation, size, params.terrainSmoothing ?? 0, true);
    dump2d("smoothed terrain", elevation.map(v=>Math.sign(v)), size, size);
    for (let i1 = 0; i1 < /*max passes*/16; i1++) {
        for (let i2 = 0; i2 < size; i2++) {
            let signChanges;
            let signChangesAcc = 0;
            for (let r = 1; r <= params.terrainSmoothing ?? 0; r++) {
                [elevation, , signChanges] = medianBlur(elevation, size, r, true, params.smoothingThreshold ?? 0.5);
                signChangesAcc += signChanges;
            }
            dump2d(`threshold smoothed terrain (round ${i1},${i2}: ${signChangesAcc} sign changes)`, elevation.map(v=>Math.sign(v)), size, size);
            if (signChangesAcc === 0) {
                break;
            }
        }
        let changesAcc = 0;
        let changes;
        let thinnest;
        [elevation, changes] = erodeAndDilate(elevation, size, true, params.minimumThickness);
        changesAcc += changes;
        dump2d(`erodeAndDilate land (round ${i1}: ${changes} fixes)`, elevation.map(v=>Math.sign(v)), size, size);
        [thinnest, changes] = fixThinMassesInPlaceFull(elevation, size, true, params.minimumThickness);
        changesAcc += changes;
        dump2d(`fixThinMassesInPlace land (round ${i1}: ${thinnest} tightness, ${changes} fixes)`, elevation.map(v=>Math.sign(v)), size, size);

        const midFixElevation = elevation.slice();

        [elevation, changes] = erodeAndDilate(elevation, size, false, params.minimumThickness);
        changesAcc += changes;
        dump2d(`erodeAndDilate sea (round ${i1}: ${changes} fixes)`, elevation.map(v=>Math.sign(v)), size, size);
        [thinnest, changes] = fixThinMassesInPlaceFull(elevation, size, false, params.minimumThickness);
        changesAcc += changes;
        dump2d(`fixThinMassesInPlace sea (round ${i1}: ${thinnest} tightness, ${changes} fixes)`, elevation.map(v=>Math.sign(v)), size, size);
        if (changesAcc === 0) {
            break;
        }
        console.log("Thinness corrections were made. Running extra passes.");
        if (i1 >= 8 && i1 % 4 === 0) {
            console.log("Struggling to stablize terrain. Leveling problematic regions.");
            const diff = zip2(midFixElevation, elevation, (a, b)=>(a!==b ? 1 : 0));
            dump2d(`unstable (round ${i1})`, diff, size, size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = y * size + x;
                    if (diff[i] === 1) {
                        reserveCircleInPlace(elevation, size, x, y, params.minimumThickness * 2, 1);
                    }
                }
            }
            dump2d(`leveled (round ${i1})`, elevation, size, size);
        }
        // let changes;
        // [elevation, changes] = fixThinMasses(elevation, size, true, /*radius=*/1);
        // dump2d(`grow thin land masses (round ${i1}: ${changes} fixes)`, elevation.map(v=>Math.sign(v)), size, size);
        // if (changes !== 0) {
        //     console.log("Thin land masses found. Fixing and running extra smoothing passes.");
        //     continue;
        // }

        // [elevation, changes] = fixThinMasses(elevation, size, false, /*radius=*/1);
        // dump2d(`grow thin sea masses (round ${i1}: ${changes} fixes)`, elevation.map(v=>Math.sign(v)), size, size);
        // if (changes !== 0) {
        //     console.log("Thin sea masses found. Fixing and running extra smoothing passes.");
        //     continue;
        // } else {
        //     break;
        // }
    }

    let coastlines = detectCoastlines(elevation, size);
    coastlines = tweakCoastlines(coastlines, size);
    // { // DEBUG
    //     for (const coastline of coastlines) {
    //         coastline[0].debugColor = 'blue';
    //         coastline[0].debugRadius = 6;
    //         dump2d(`DEBUG coast`, elevation, size, size, coastline);
    //     }
    // }

    const entities = [];

    if (params.createEntities) {
        // Spawn generation
        let roominess = calculateRoominess(elevation, size);
        {
            const spawnPreference = calculateSpawnPreferences(roominess, size, params.centralReservation, params.spawnRegionSize, params.mirror);
            dump2d("elevation", elevation, size, size);
            dump2d("player roominess", roominess, size, size);
            const templatePlayer = findRandomMax(random, spawnPreference, size, params.spawnRegionSize);
            templatePlayer.debugColor = "white";
            templatePlayer.debugRadius = 2;
            templatePlayer.radius = params.spawnBuildSize;
            const zones = generateFeatureRing(random, templatePlayer, "spawn", params.spawnBuildSize, params.spawnRegionSize, params);
            entities.push(
                ...rotateAndMirror(
                    [templatePlayer, ...zones],
                    size,
                    params.rotations,
                    params.mirror,
                )
            );
            dump2d("players", spawnPreference, size, size, entities);
            for (let entity of entities) {
                reserveCircleInPlace(roominess, size, entity.x, entity.y, entity.radius, -1);
            }
        }

        // Expansions
        for (let i = 0; i < params.maxExpansions ?? 0; i++) {
            roominess = calculateRoominess(roominess, size);
            dump2d(`expansion roominess ${i}`, roominess, size, size);
            const templateExpansion = findRandomMax(random, roominess, size, params.maxExpansionSize + params.expansionBorder);
            let radius = templateExpansion.value - params.expansionBorder;
            if (radius < params.minExpansionSize) {
                break;
            }
            if (radius > params.maxExpansionSize) {
                radius = params.maxExpansionSize;
            }

            const zones = generateFeatureRing(random, templateExpansion, "expansion", params.expansionInner, radius, params);
            entities.push(
                ...rotateAndMirror(
                    zones,
                    size,
                    params.rotations,
                    params.mirror,
                )
            );
            for (let entity of entities) {
                reserveCircleInPlace(roominess, size, entity.x, entity.y, entity.radius, -1);
            }
        }

        // Neutral buildings
        {
            const buildings = (params.maxBuildings ?? 0 !== 0) ? random.u32() % (params.maxBuildings + 1) : 0;
            for (let i = 0; i < buildings; i++) {
                roominess = calculateRoominess(roominess, size);
                dump2d(`building roominess ${i}`, roominess, size, size);
                const templateBuilding = findRandomMax(random, roominess, size, 3);
                if (templateBuilding.value < 3) {
                    break;
                }
                templateBuilding.radius = 2;
                templateBuilding.debugRadius = 2;
                templateBuilding.debugColor = "blue";
                entities.push(
                    ...rotateAndMirror(
                        [templateBuilding],
                        size,
                        params.rotations,
                        params.mirror,
                    )
                );
                for (let entity of entities) {
                    reserveCircleInPlace(roominess, size, entity.x, entity.y, entity.radius, -1);
                }
            }
        }

        // Debug output
        dump2d("entities", elevation.map(x=>(x>0?1:0)), size, size, entities);
    }

    // // Zone for wave-function collapse
    // roominess = calculateRoominess(elevation, size, true);
    // const waterBias = new Float32Array(size * size);
    // const clearBias = new Float32Array(size * size);
    // const beachBias = new Float32Array(size * size);
    // for (let i = 0; i < waterBias.length; i++) {
    //     waterBias[i] = 0.0;
    //     clearBias[i] = 0.0;
    //     beachBias[i] = 0.0;
    //     if (roominess[i] === 1) {
    //         beachBias[i] = 1.0;
    //         clearBias[i] = 1.0;
    //     } else if (roominess[i] === -1) {
    //         beachBias[i] = 1.0;
    //         waterBias[i] = 1.0;
    //     } else if (roominess[i] > 0) {
    //         waterBias[i] = 0.0;
    //         clearBias[i] = roominess[i];
    //         beachBias[i] = 0.0;
    //     } else { // roominess is never zero
    //         waterBias[i] = -roominess[i];
    //         clearBias[i] = 0.0;
    //     }
    //     // if (roominess[i] >= 2) {
    //     //     waterBias[i] = 0.0;
    //     //     clearBias[i] = 2.0;
    //     // } else if (roominess[i] >= 1) {
    //     //     waterBias[i] = 0.1;
    //     //     clearBias[i] = 1.0;
    //     // } else if (roominess[i] >= -1) { // roominess[i] never equals zero.
    //     //     waterBias[i] = 0.5;
    //     //     clearBias[i] = 1.0;
    //     // } else if (roominess[i] >= -2) {
    //     //     waterBias[i] = 0.8;
    //     //     clearBias[i] = 1.0;
    //     // } else if (roominess[i] >= -3) {
    //     //     waterBias[i] = 1.0;
    //     //     clearBias[i] = 1.0;
    //     // } else {
    //     //     waterBias[i] = 1.0;
    //     //     clearBias[i] = 0.0;
    //     // }
    // }
    // dump2d("waterBias", waterBias, size, size);
    // dump2d("clearBias", clearBias, size, size);
    // const rockBias = new Float32Array(size * size);
    // for (let entity of entities) {
    //     if (entity.type === "rock") {
    //         reserveCircleInPlace(rockBias, size, entity.x, entity.y, entity.radius, (rSq, v)=>Math.max(v, 1/(rSq+1)));
    //     }
    // }
    // // dump2d("rockBias", rockBias, size, size);
    // // const clearBias = new Float32Array(size * size);
    // // for (let i = 0; i < clearBias.length; i++) {
    // //     clearBias[i] = 1 - waterBias[i] - rockBias[i];
    // // }

    // // Wave-funtion collapse
    // const tiles = new Array(size * size);
    // const tiles = collapseTiles(
    //     {
    //         "Clear": clearBias,
    //         "Water": waterBias,
    //         // "Rock": rockBias,
    //         "Beach": beachBias,
    //     },
    //     size,
    //     params,
    // );
    
    const tiles = new Array(size * size);

    // const rand = new Uint8Array(map.types.length);
    // crypto.getRandomValues(rand);
    for (let n = 0; n < tiles.length; n++) {
        if (elevation[n] >= 0) {
            tiles[n] = 't255';
        } else {
            tiles[n] = 't1i0';
        }
        if (tiles[n] === null) {
            tiles[n] = 't51i8';
        }
        // map.types[i] = (elevation[i] >= 0) ? "Clear" : "Water";
        // map.types[i] = (map.random.i32() & 0x100) ? "Clear" : "Water";
        // map.types[i] = (rand[i] & 1) ? "Clear" : "Water";
    }
    for (const coastline of coastlines) {
        tileCoastline(tiles, size, coastline, random, params);
    }

    // Assign missing indexes
    // const tRe = /^t(\d+)$/;
    for (let n = 0; n < tiles.length; n++) {
        // const t = map.tiles[n].match(tRe);
        // if (t != null) {
        if (codeMap[tiles[n]].Codes.length > 1) {
            tiles[n] = random.pick(codeMap[tiles[n]].Codes);
        }
    }

    // Compilation
    const map = {
        random,
        elevation,
        tiles: tiles,
        types: Array(size * size),
        bin: {},
        spawns: [],
    };

    map.bin.u8format = 2;
    map.bin.u16width = size + 2;
    map.bin.u16height = size + 2;
    map.bin.gridSize = map.bin.u16width * map.bin.u16height;
    map.bin.u32tileOffset = 17;
    map.bin.u32heightMapOffset = 0;
    map.bin.u32resourcesOffset = map.bin.u32tileOffset + 3 * map.bin.gridSize;
    map.bin.size = map.bin.u32resourcesOffset + 2 * map.bin.gridSize;
    map.bin.data = new Uint8Array(map.bin.size);

    writeU8(map.bin.data, 0, map.bin.u8format);
    writeU16(map.bin.data, 1, map.bin.u16width);
    writeU16(map.bin.data, 3, map.bin.u16height);
    writeU32(map.bin.data, 5, map.bin.u32tileOffset);
    writeU32(map.bin.data, 9, map.bin.u32heightMapOffset);
    writeU32(map.bin.data, 13, map.bin.u32resourcesOffset);
    for (let n = 0; n < map.bin.gridSize; n++) {
        writeU16(map.bin.data, map.bin.u32tileOffset + n * 3, 255 /* Grass */);
        writeU8(map.bin.data, map.bin.u32tileOffset + n * 3 + 2, 0 /* Index 0 */);

        writeU8(map.bin.data, map.bin.u32resourcesOffset + n * 2, 0 /* Type */);
        writeU8(map.bin.data, map.bin.u32resourcesOffset + n * 2 + 1, 0 /* Density */);
    }

    const tiRe = /^t(\d+)i(\d+)$/;
    // OpenRA map format scans vertically. See dataGridN.
    for (let x = 0; x < size; x++) {
        for (let y = 0; y < size; y++) {
            const n = y * size + x;
            const ti = map.tiles[n].match(tiRe);
            const t = ti[1] | 0;
            const i = ti[2] | 0;
            map.types[n] = codeMap[map.tiles[n]].Type;
            // map.types[i] = codeMap[info.TileInfo["t" + map.tileT[i] + "i" + map.tileI[i]]].Type;

            const dataGridN = (x + 1) * map.bin.u16width + (y + 1);
            const dataTileOffset = map.bin.u32tileOffset + dataGridN * 3;
            writeU16(map.bin.data, dataTileOffset, t /* Grass */);
            writeU8(map.bin.data, dataTileOffset + 2, i /* Index 0 */);
        }
    }

    return map;
}

export function generate() {
    if (!ready) return;

    debugDiv.replaceChildren();

    const canvas = document.getElementById("canvas");

    const zoom = document.getElementById("zoom").value | 0;
    const seed = document.getElementById("seed").value | 0;
    const size = document.getElementById("size").value | 0;
    const water = document.getElementById("water").value;
    const terrainSmoothing = document.getElementById("terrain-smoothing").value | 0;
    const smoothingThreshold = document.getElementById("smoothing-threshold").value;
    const minimumThickness = document.getElementById("minimum-thickness").value | 0;
    const wavelengthScale = document.getElementById("wavelength-scale").value;
    const rotations = document.getElementById("rotations").value | 0;
    const mirror = document.getElementById("mirror").value | 0;
    const createEntities = document.getElementById("create-entities").checked;
    const players_per_rotation = document.getElementById("players-per-rotation").value | 0;
    const centralReservation = document.getElementById("central-reservation").value | 0;
    const spawnRegionSize = document.getElementById("spawn-region-size").value | 0;
    const spawnBuildSize = document.getElementById("spawn-build-size").value | 0;
    const spawnMines = document.getElementById("spawn-mines").value | 0;
    const spawnOre = document.getElementById("spawn-ore").value | 0;
    const maxExpansions = document.getElementById("max-expansions").value | 0;
    const minExpansionSize = document.getElementById("min-expansion-size").value | 0;
    const maxExpansionSize = document.getElementById("max-expansion-size").value | 0;
    const expansionInner = document.getElementById("expansion-inner").value | 0;
    const expansionBorder = document.getElementById("expansion-border").value | 0;
    const expansionMines = document.getElementById("expansion-mines").value;
    const expansionOre = document.getElementById("expansion-ore").value | 0;
    const rockWeight = document.getElementById("rock-weight").value;
    const rockSize = document.getElementById("rock-size").value | 0;
    const maxBuildings = document.getElementById("max-buildings").value | 0;

    const saveBin = document.getElementById("saveBin");

    const map = generateMap({
        seed,
        size,
        water,
        terrainSmoothing,
        smoothingThreshold,
        minimumThickness,
        wavelengthScale,
        rotations,
        mirror,
        createEntities,
        players_per_rotation,
        centralReservation,
        spawnRegionSize,
        spawnBuildSize,
        spawnMines,
        spawnOre,
        maxExpansions,
        minExpansionSize,
        maxExpansionSize,
        expansionInner,
        expansionBorder,
        expansionMines,
        expansionOre,
        rockWeight,
        rockSize,
        maxBuildings,
    });
    window.map = map;

    document.getElementById("description").textContent =`
Seed: ${map.random.seed}
`;

    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size * zoom;
    canvas.style.height = size * zoom;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            ctx.fillStyle = terrainColor(map.types[y * size + x]);
            // ctx.fillStyle = "rgb(0, "+(map.elevation[y * size + x]*5000+128)+", 0)";
            ctx.fillRect(x, y, 1, 1);
        }
    }

    const blob = new Blob([map.bin.data], {type: 'application/octet-stream'});
    saveBin.href = URL.createObjectURL(blob);
}


window.generate = generate;

window.randomSeed = function() {
    // This isn't great.
    const seed = (Math.random() * 0x100000000) & 0xffffffff;
    document.getElementById("seed").value = seed;
    console.log(seed);
};

fetch("temperat-info.json")
    .then((response) => response.json())
    .then((data) => {
        info = data;
        window.info = info;
        info.codeMap = codeMap;
        info.uniqueEdges = {};
        info.edges = {};
        info.sortedIndices = [];
        info.tileCount = 0;
        const recordEdge = function(edge, direction, tiIndex) {
            info.edges[edge] ??= {
                L: new Set(),
                R: new Set(),
                U: new Set(),
                D: new Set(),
            };
            info.edges[edge][direction].add(tiIndex);
            info.uniqueEdges[edge] ??= {};
            if (typeof(info.uniqueEdges[edge][direction]) === "undefined") {
                info.uniqueEdges[edge][direction] = tiIndex;
            } else {
                info.uniqueEdges[edge][direction] = null;
            }
        }
        for (const tiIndex in info.TileInfo) {
            if (!Object.hasOwn(info.TileInfo, tiIndex)) {
                continue;
            }
            const ti = info.TileInfo[tiIndex];
            ti.AllTypes = new Set(ti.AllTypes);
            codeMap[tiIndex] = ti;
            for (let code of ti.Codes) {
                codeMap[code] = ti;
            }
            recordEdge(ti.L, 'R', tiIndex);
            recordEdge(ti.R, 'L', tiIndex);
            recordEdge(ti.U, 'D', tiIndex);
            recordEdge(ti.D, 'U', tiIndex);
            info.tileCount++;
            info.sortedIndices.push(tiIndex);
        }
        info.sortedIndices.sort();
        for (const uniqueEdge of Object.values(info.uniqueEdges)) {
            uniqueEdge.L ??= null;
            uniqueEdge.R ??= null;
            uniqueEdge.U ??= null;
            uniqueEdge.D ??= null;
            (uniqueEdge.L === null) === (uniqueEdge.R === null) || console.log(`Possible L-R mismatch for ${JSON.stringify(uniqueEdge)}`);
            (uniqueEdge.U === null) === (uniqueEdge.D === null) || console.log(`Possible U-D mismatch for ${JSON.stringify(uniqueEdge)}`);
        }
        const sizeRe = /^(\d+),(\d+)$/;
        for (const templateName of Object.keys(info.Tileset.Templates).toSorted()) {
            const template = info.Tileset.Templates[templateName];
            let [, x, y] = template.Size.match(sizeRe);
            template.SizeX = x | 0;
            template.SizeY = y | 0;
        }
        const templatesByStartDir = [[], [], [], []];
        const templatesByEndDir = [[], [], [], []];
        for (const templateName of Object.keys(info.TemplatePaths).toSorted()) {
            // if (!Object.hasOwn(info.TemplatePaths, templateName)) {
            //     continue;
            // }
            const template = info.TemplatePaths[templateName];
            template.Path = template.Path.map(p => ({x: p[0] | 0, y: p[1] | 0}));
            template.PathND = template.PathND.map(p => ({x: p[0] | 0, y: p[1] | 0}));
            template.Name = templateName;
            template.StartDir = letterToDirection(template.StartDir);
            template.EndDir = letterToDirection(template.EndDir);
            template.MovesX = template.Path[template.Path.length-1].x - template.Path[0].x;
            template.MovesY = template.Path[template.Path.length-1].y - template.Path[0].y;
            template.OffsetX = template.Path[0].x;
            template.OffsetY = template.Path[0].y;
            template.Progress = template.Path.length - 1;
            template.ProgressLow = Math.ceil(template.Progress / 2);
            template.ProgressHigh = Math.floor(template.Progress * 1.5);
            templatesByStartDir[template.StartDir].push(template);
            templatesByEndDir[template.EndDir].push(template);
            // Last point has no direction.
            for (let i = 0; i < template.PathND.length - 1; i++) {
                template.PathND[i].d = calculateDirection(template.PathND[i], template.PathND[i+1]);
            }
            template.PathND[template.PathND.length - 1].d = DIRECTION_NONE;
            template.RelPathND = template.PathND.map(p => ({
                x: p.x - template.OffsetX,
                y: p.y - template.OffsetY,
                d: p.d, // distance
                dm: 1 << p.d, // distance mask
                dmr: 1 << (p.d ^ 2), // distance mask reverse
            }));
        }
        info.templatesByStartDir = templatesByStartDir;
        info.templatesByEndDir = templatesByEndDir;

        ready = true;
        generate();
    });
