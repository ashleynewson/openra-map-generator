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

function breakpoint() {}

function dump2d(label, data, w, h, points) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w*6}px`;
    canvas.style.height = `${h*6}px`;
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

const DIRECTION_R  = 0;
const DIRECTION_RD = 1;
const DIRECTION_D  = 2;
const DIRECTION_LD = 3;
const DIRECTION_L  = 4;
const DIRECTION_LU = 5;
const DIRECTION_U  = 6;
const DIRECTION_RU = 7;
const DIRECTION_NONE = -1;

function letterToDirection(letter) {
    switch (letter) {
    case 'R' : return DIRECTION_R;
    case 'RD': return DIRECTION_RD;
    case 'D' : return DIRECTION_D;
    case 'LD': return DIRECTION_LD;
    case 'L' : return DIRECTION_L;
    case 'LU': return DIRECTION_LU;
    case 'U' : return DIRECTION_U;
    case 'RU': return DIRECTION_RU;
    default: die('Bad direction letter: ' + letter);
    }
}

function mirrorXY(x, y, size, mirror) {
    switch (mirror) {
    case 0:
        die("avoid calling mirrorXY for mirror === 0");
    case 1:
        return [           x, size - 1 - y];
    case 2:
        return [           y,            x];
    case 3:
        return [size - 1 - x,            y];
    case 4:
        return [size - 1 - y, size - 1 - x];
    default:
        die("bad mirror direction");
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
                const [tx, ty] = mirrorXY(x, y, size, params.mirror);
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
                const [mx, my] = mirrorXY(projX, projY, size, mirror);
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
    radius1 <= radius2 || die("radius1 was greater than radius2");
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

function zip2(a, b, f) {
    a.length === b.length || die("arrays do not have equal length");
    const c = a.slice();
    for (let i = 0; i < c.length; i++) {
        c[i] = f(a[i], b[i], i);
    }
    return c;
}

function detectCoastlines(elevation, size) {
    const typeN = info.typeNs["Coastline"];
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
        points.push({x, y, typeN});
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
            points.push({x, y, typeN});
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
        coastlines.push({
            points,
            type: "Coastline",
            permittedTemplates: info.templatesByType["Coastline"],
        });
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

function tweakPath(path, size) {
    size ?? die("need size");
    const points = path.points;
    const len = path.points.length;
    const lst = len - 1;
    const tweakedPath = Object.assign({}, path);
    // tweakedPath.permittedTemplates = path.permittedTemplates;
    const isLoop = points[0].x === points[lst].x && points[0].y === points[lst].y;
    tweakedPath.isLoop = isLoop;
    if (isLoop) {
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
            const dim = points[i].x === points[prevI].x ? 1 : 0;
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
        tweakedPath.points = [...points.slice(favouritePoint, nrlen), ...points.slice(0, favouritePoint + 1)];
        tweakedPath.startDirN = calculateDirectionPoints(tweakedPath.points[0], tweakedPath.points[1]);
        tweakedPath.endDirN = calculateDirectionPoints(tweakedPath.points[0], tweakedPath.points[1]);
    } else {
        // TODO: Support non-edge non-loop paths. However, some care is
        // needed in case they start having the potential to overlap.
        // (This could perhaps instead be done in the path layout.
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
                newPoint = Object.assign({}, point, {x: newPoint.x + ox, y: newPoint.y + oy});
                extension.push(newPoint);
            }
            return extension;
        };
        // Open paths. Extend to edges.
        const startExt = extend(points[0], /*extensionLength=*/4).reverse();
        const endExt = extend(points[lst], /*extensionLength=*/4);
        tweakedPath.points = [...startExt, ...points, ...endExt];
        tweakedPath.startDirN = calculateDirectionPoints(tweakedPath.points[0], tweakedPath.points[1]);
        tweakedPath.endDirN = calculateDirectionPoints(tweakedPath.points[tweakedPath.points.length - 2], tweakedPath.points[tweakedPath.points.length - 1]);
    }
    return tweakedPath;
}

function calculateDirectionXY(dx, dy) {
    if (dx > 0) {
        if (dy > 0) {
            return DIRECTION_RD;
        } else if (dy < 0) {
            return DIRECTION_RU;
        } else {
            return DIRECTION_R;
        }
    } else if (dx < 0) {
        if (dy > 0) {
            return DIRECTION_LD;
        } else if (dy < 0) {
            return DIRECTION_LU;
        } else {
            return DIRECTION_L;
        }
        return DIRECTION_L;
    } else {
        if (dy > 0) {
            return DIRECTION_D;
        } else if (dy < 0) {
            return DIRECTION_U;
        } else {
            die("Bad direction");
        }
    }
}
function calculateDirectionPoints(now, next) {
    const dx = next.x - now.x;
    const dy = next.y - now.y;
    return calculateDirectionXY(dx, dy);
}

function reverseDirection(direction) {
    if (direction === DIRECTION_NONE) {
        return DIRECTION_NONE;
    }
    return direction ^ 4;
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

function tilePath(tiles, tilesSize, path, random, params) {
    let minPointX = Infinity;
    let minPointY = Infinity;
    let maxPointX = -Infinity;
    let maxPointY = -Infinity;
    for (const point of path.points) {
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
    const points = path.points.map(point => Object.assign({}, point, {x: point.x - minPointX, y: point.y - minPointY}));

    const isLoop = path.isLoop;

    // grid points (not squares), so these are offset 0.5 from tile centers.
    const sizeX = 1 + maxPointX - minPointX;
    const sizeY = 1 + maxPointY - minPointY;
    const sizeXY = sizeX * sizeY;

    const MAX_DEVIATION = 0xffffffff;
    // Bit masks of 8-angle directions which are considered a positive progress
    // traversal. Template choices with an overall negative progress traversal
    // are rejected.
    const directions = new Uint8Array(sizeXY).fill(0);
    // How far away from the path this point is.
    const deviations = new Uint32Array(sizeXY).fill(MAX_DEVIATION);
    // Bit masks of 8-angle directions which define whether it's permitted
    // to traverse from one point to a given neighbour.
    const traversables = new Uint8Array(sizeXY).fill(0);
    {
        const gradientX = new Int32Array(sizeXY).fill(0);
        const gradientY = new Int32Array(sizeXY).fill(0);
        for (let pointI = 0; pointI < points.length; pointI++) {
            if (isLoop && pointI == 0) {
                // Same as last point.
                continue;
            }
            const point = points[pointI];
            const pointPrevI = pointI - 1;
            const pointNextI = pointI + 1;
            let directionX = 0;
            let directionY = 0;
            if (pointNextI < points.length) {
                directionX += points[pointNextI].x - point.x;
                directionY += points[pointNextI].y - point.y;
            }
            if (pointPrevI >= 0) {
                directionX += point.x - points[pointPrevI].x;
                directionY += point.y - points[pointPrevI].y;
            }
            for (let deviation = 0; deviation <= maxDeviation; deviation++) {
                const minX = point.x - deviation;
                const minY = point.y - deviation;
                const maxX = point.x + deviation;
                const maxY = point.y + deviation;
                for (let y = minY; y <= maxY; y++) {
                    for (let x = minX; x <= maxX; x++) {
                        const i = y * sizeX + x;
                        if (deviation < deviations[i]) {
                            deviations[i] = deviation;
                        }
                        if (deviation === maxDeviation) {
                            gradientX[i] += directionX;
                            gradientY[i] += directionY;
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
                            if (x > minX && y > minY) {
                                traversables[i] |= 1 << DIRECTION_LU;
                            }
                            if (x > minX && y < maxY) {
                                traversables[i] |= 1 << DIRECTION_LD;
                            }
                            if (x > maxX && y > minY) {
                                traversables[i] |= 1 << DIRECTION_RU;
                            }
                            if (x > maxX && y < maxY) {
                                traversables[i] |= 1 << DIRECTION_RD;
                            }
                        }
                    }
                }
            }
        }
        // Probational
        for (let i = 0; i < sizeXY; i++) {
            if (gradientX[i] === 0 && gradientY[i] === 0) {
                directions[i] = 0;
                continue;
            }
            const direction = calculateDirectionXY(gradientX[i], gradientY[i]);
            //     direction: 0123456701234567
            //                 UUU DDD UUU DDD
            //                 R LLL RRR LLL R
            directions[i] = (0b100000111000001 >> (7 - direction)) & 0b11111111;
        }
    }

    const templates = path.permittedTemplates;
    const templatesByStartBorder = [];
    const templatesByEndBorder = [];
    const MAX_SCORE = 0xffffffff;

    // Z refers to the "layer", mapped from a "border".
    // i  =              y * SizeX + x // i does not dictate a layer.
    // il = z * SizeXY + y * SizeX + x // il is for a specific layer.
    const borderToZ = [];
    const zToBorder = [];

    {
        const assignForBorder = function(border) {
            if (typeof(borderToZ[border]) !== "undefined") {
                return;
            }
            borderToZ[border] = zToBorder.length;
            zToBorder.push(border);
            templatesByStartBorder[border] = [];
            templatesByEndBorder[border] = [];
        };
        for (const template of templates) {
            assignForBorder(template.StartBorderN);
            assignForBorder(template.EndBorderN);
        }
        for (const template of templates) {
            templatesByStartBorder[template.StartBorderN].push(template);
            templatesByEndBorder[template.EndBorderN].push(template);
        }
    }

    const sizeXYZ = sizeXY * zToBorder.length;
    const priorities = new PriorityArray(sizeXYZ).fill(-Infinity);
    const scores = new Uint32Array(sizeXYZ).fill(MAX_SCORE);

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
                return MAX_SCORE;
            }
            if (pointI < lastPointI) {
                if ((traversables[pi] & point.dm) === 0) {
                    // Next point escapes traversable area.
                    return MAX_SCORE;
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
            return MAX_SCORE;
        }
        // Satisfies all requirements.
        return deviationAcc;
    }

    const updateFrom = function(fx, fy, fb) {
        const fi = fy * sizeX + fx;
        const fil = borderToZ[fb] * sizeXY + fi;
        const fscore = scores[fil];
        template_loop: for (const template of templatesByStartBorder[fb]) {
            const tx = fx + template.MovesX;
            const ty = fy + template.MovesY;
            const ti = ty * sizeX + tx;
            if (tx < 0 || tx >= sizeX || ty < 0 || ty >= sizeY) {
                continue template_loop;
            }
            // Most likely to fail. Check first.
            if (deviations[ti] === MAX_DEVIATION) {
                // End escapes bounds.
                continue template_loop;
            }

            const templateScore = scoreTemplate(template, fx, fy);
            if (templateScore === MAX_SCORE) {
                continue template_loop;
            }

            const tscore = fscore + templateScore;
            const tb = template.EndDir;
            const til = borderToZ[tb] * sizeXY + ti;
            if (tscore < scores[til]) {
                scores[til] = tscore;
                priorities.set(til, -tscore);
            }
        }
        priorities.set(fil, -Infinity);
    };

    const sx = points[0].x;
    const sy = points[0].y;
    const si = sy * sizeX + sx;
    const sb = info.borderNs[points[0].typeN][path.startDirN];
    const sil = borderToZ[sb] * sizeXY + si;
    {
        scores[sil] = 0;
        updateFrom(sx, sy, sb);
        // Needed in case we loop back to the start.
        scores[sil] = MAX_SCORE;
    }
    for (;;) {
        const fil = priorities.getMaxIndex() | 0;
        if (priorities.get(fil) === -Infinity) {
            break;
        }
        const fz = (fil / sizeXY) | 0;
        const fb = zToBorder[fz];
        const fi = (fil % sizeXY) | 0;
        const fy = (fi / sizeX) | 0;
        const fx = (fi % sizeX) | 0;
        updateFrom(fx, fy, fb);
    }

    const traceBackStep = function(tx, ty, tb) {
        const ti = ty * sizeX + tx;
        const til = borderToZ[tb] * sizeXY + ti;
        const tscore = scores[til];
        const candidates = [];
        template_loop: for (const template of templatesByEndBorder[tb]) {
            const fx = tx - template.MovesX;
            const fy = ty - template.MovesY;
            const fi = fy * sizeX + fx;
            if (fx < 0 || fx >= sizeX || fy < 0 || fy >= sizeY) {
                continue template_loop;
            }
            // Most likely to fail. Check first.
            if (deviations[fi] === MAX_DEVIATION) {
                // Start escapes bounds.
                continue template_loop;
            }

            const templateScore = scoreTemplate(template, fx, fy);
            if (templateScore === MAX_SCORE) {
                continue template_loop;
            }

            const fscore = tscore - templateScore;
            const fil = borderToZ[template.StartBorderN] * sizeXY + fi;
            if (fscore === scores[fil]) {
                candidates.push(template);
            }
        }
        candidates.length >= 1 || die("Assertion failure");
        const template = random.pick(candidates);
        const fx = tx - template.MovesX;
        const fy = ty - template.MovesY;
        const templateInfo = info.Tileset.Templates[template.Name];
        paintTemplate(tiles, tilesSize, fx - template.OffsetX + minPointX, fy - template.OffsetY + minPointY, templateInfo);
        return {
            x: fx,
            y: fy,
            b: template.StartBorderN,
        };
    };

    // Trace back and update tiles
    {
        let tx = points[points.length-1].x;
        let ty = points[points.length-1].y;
        let tb = info.borderNs[points[points.length-1].typeN][path.endDirN];
        let ti = ty * sizeX + tx;
        let til = borderToZ[tb] * sizeXY + ti;
        if (scores[til] === MAX_SCORE) {
            die("Could not fit tiles for path");
        }
        console.log(`Path ${path.type}[${path.isLoop ? "looped " : ""}${path.points.length}] has error score ${scores[til]} (${scores[til] / path.points.length} per point)`);
        let p = traceBackStep(tx, ty, tb);
        // We previously set this to MAX_SCORE in case we were a loop. Reset it for getting back to the start.
        scores[sil] = 0;
        // No need to check direction. If that is an issue, I have bigger problems to worry about.
        while (p.x !== sx || p.y !== sy) {
            p = traceBackStep(p.x, p.y, p.b);
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
    }

    let coastlines = detectCoastlines(elevation, size);
    coastlines = coastlines.map(coastline => tweakPath(coastline, size));
    // { // DEBUG
    //     for (const coastline of coastlines) {
    //         coastline[0].debugColor = 'blue';
    //         coastline[0].debugRadius = 6;
    //         dump2d(`DEBUG coast`, elevation, size, size, coastline);
    //     }
    // }

    const tiles = new Array(size * size);
    const resources = new Uint8Array(size * size);
    const resourceDensities = new Uint8Array(size * size);

    for (let n = 0; n < tiles.length; n++) {
        if (elevation[n] >= 0) {
            tiles[n] = 't255';
        } else {
            tiles[n] = 't1i0';
        }
        if (tiles[n] === null) {
            tiles[n] = 't51i8';
        }
    }
    for (const coastline of coastlines) {
        tilePath(tiles, size, coastline, random, params);
    }

    const entities = [];
    const players = [];

    if (params.createEntities) {
        const zones = [];
        const zoneable = new Int8Array(size * size);
        for (let n = 0; n < tiles.length; n++) {
            zoneable[n] = (codeMap[tiles[n]].Type === 'Clear') ? 1 : -1;
        }
        let roominess = calculateRoominess(zoneable, size);

        // Spawn generation
        for (let iteration = 0; iteration < params.playersPerRotation; iteration++) {
            roominess = calculateRoominess(roominess, size);
            const spawnPreference = calculateSpawnPreferences(roominess, size, params.centralReservation, params.spawnRegionSize, params.mirror);
            dump2d("zoneable", zoneable, size, size);
            dump2d("player roominess", roominess, size, size);
            const templatePlayer = findRandomMax(random, spawnPreference, size, params.spawnRegionSize);
            const room = templatePlayer.value - 1;
            const radius1 = Math.min(params.spawnBuildSize, room);
            const radius2 = Math.min(params.spawnRegionSize, room);
            templatePlayer.debugColor = "white";
            templatePlayer.debugRadius = 2;
            templatePlayer.radius = params.spawnBuildSize;
            templatePlayer.owner = "Neutral";
            templatePlayer.type = "mpspawn";
            players.push(
                ...rotateAndMirror(
                    [templatePlayer],
                    size,
                    params.rotations,
                    params.mirror,
                )
            );

            const spawnZones = generateFeatureRing(random, templatePlayer, "spawn", radius1, radius2, params);
            zones.push(
                ...rotateAndMirror(
                    [templatePlayer, ...spawnZones],
                    size,
                    params.rotations,
                    params.mirror,
                )
            );
            for (let zone of zones) {
                reserveCircleInPlace(roominess, size, zone.x, zone.y, zone.radius, -1);
            }
        }
        players.forEach((el, i) => {
            el.number = i;
            el.name = `Multi${i}`;
        });
        entities.push(...players);

        // Expansions
        for (let i = 0; i < params.maxExpansions ?? 0; i++) {
            roominess = calculateRoominess(roominess, size);
            dump2d(`expansion roominess ${i}`, roominess, size, size);
            const templateExpansion = findRandomMax(random, roominess, size, params.maxExpansionSize + params.expansionBorder);
            const room = templateExpansion.value - 1;
            let radius2 = room - params.expansionBorder;
            if (radius2 < params.minExpansionSize) {
                break;
            }
            if (radius2 > params.maxExpansionSize) {
                radius2 = params.maxExpansionSize;
            }
            const radius1 = Math.min(Math.min(params.expansionInner, room), radius2);

            const expansionZones = generateFeatureRing(random, templateExpansion, "expansion", radius1, radius2, params);
            zones.push(
                ...rotateAndMirror(
                    expansionZones,
                    size,
                    params.rotations,
                    params.mirror,
                )
            );
            for (let zone of zones) {
                reserveCircleInPlace(roominess, size, zone.x, zone.y, zone.radius, -1);
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
                zones.push(
                    ...rotateAndMirror(
                        [templateBuilding],
                        size,
                        params.rotations,
                        params.mirror,
                    )
                );
                for (let zone of zones) {
                    reserveCircleInPlace(roominess, size, zone.x, zone.y, zone.radius, -1);
                }
            }
        }

        for (const zone of zones) {
            switch (zone.type) {
            case "mine":
                entities.push({
                    type: "mine",
                    owner: "Neutral",
                    x: zone.x,
                    y: zone.y,
                });
                reserveCircleInPlace(resources, size, zone.x, zone.y, zone.radius, 1);
                // Density seems to be a constant in map format
                reserveCircleInPlace(resourceDensities, size, zone.x, zone.y, zone.radius, 12);
                break;
            case "gmine":
                entities.push({
                    type: "gmine",
                    owner: "Neutral",
                    x: zone.x,
                    y: zone.y,
                });
                reserveCircleInPlace(resources, size, zone.x, zone.y, zone.radius, 2);
                // Density seems to be a constant in map format
                reserveCircleInPlace(resourceDensities, size, zone.x, zone.y, zone.radius, 3);
                break;
            // Default ignore
            }
        }

        // Remove any ore that goes outside of the bounds of clear tiles.
        // (This may introduce some significant bias to certain players!)
        for (let n = 0; n < resources.length; n++) {
            if (codeMap[tiles[n]].Type !== "Clear") {
                resources[n] = 0;
                resourceDensities[n] = 0;
            }
        }

        // Debug output
        dump2d("zones", zoneable.map(x=>(x>0?1:0)), size, size, zones);
        dump2d("entities", zoneable.map(x=>(x>0?1:0)), size, size, entities);
        dump2d("resources", resources, size, size);
    }

    if (params.enforceSymmetry) {
        // const equitability = new Uint8Array(size * size).fill(1);
        const checkPoint = function(x, y, base) {
            const i = y * size + x;
            return codeMap[tiles[i]].Type === base;
        }
        const checkRotatedPoints = function(x, y, base) {
            switch (params.rotations) {
            case 1:
                return checkPoint(x, y, base);
            case 2:
                return (
                    checkPoint(           x,            y, base) &&
                    checkPoint(size - 1 - x, size - 1 - y, base)
                );
            case 4:
                return (
                    checkPoint(           x,            y, base) &&
                    checkPoint(size - 1 - y,            x, base) &&
                    checkPoint(size - 1 - x, size - 1 - y, base) &&
                    checkPoint(           y, size - 1 - x, base)
                );
            default:
                die("cannot enforce symmetry for rotations other than 1, 2, or 4");
            }
        }
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const i = y * size + x;
                const base = codeMap[tiles[i]].Type;
                let equitable = checkRotatedPoints(x, y, base);
                if (params.mirror !== 0) {
                    equitable &&= checkRotatedPoints(...mirrorXY(x, y, size, params.mirror), base);
                }
                if (!equitable) {
                    entities.push({
                        owner: "Neutral",
                        x,
                        y,
                        type: "t01",
                    });
                }
            }
        }
    }

    // Assign missing indexes
    for (let n = 0; n < tiles.length; n++) {
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
        resources,
        resourceDensities,
        bin: {},
        players,
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
    // Clear map data to empty grass (including out-of-bounds area.
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

            // +1 for x and y to account for the out-of-bounds area.
            const dataGridN = (x + 1) * map.bin.u16width + (y + 1);
            const dataTileOffset = map.bin.u32tileOffset + dataGridN * 3;
            writeU16(map.bin.data, dataTileOffset, t);
            writeU8(map.bin.data, dataTileOffset + 2, i);
            const dataResourceOffset = map.bin.u32resourcesOffset + dataGridN * 2;
            writeU8(map.bin.data, dataResourceOffset, map.resources[n]);
            writeU8(map.bin.data, dataResourceOffset + 1, map.resourceDensities[n]);
        }
    }

    // OpenRA's yaml isn't proper YAML - it's something weird and
    // specific to OpenRA called MiniYAML. So, I can't do something
    // normal and have to dump it out myself...
    map.yaml =
`MapFormat: 12
RequiresMod: ra
Title: Random Map ${params.seed} @${Date.now()}
Author: OpenRA Random Map Generator Prototype
Tileset: TEMPERAT
MapSize: ${size+2},${size+2}
Bounds: 1,1,${size},${size}
Visibility: Lobby
Categories: Conquest

Players:
\tPlayerReference@Neutral:
\t\tName: Neutral
\t\tOwnsWorld: True
\t\tNonCombatant: True
\t\tFaction: england
\tPlayerReference@Creeps:
\t\tName: Creeps
\t\tNonCombatant: True
\t\tFaction: england
`;
    if (players.length > 0) {
        const enemies = players.map(player => player.name).join(", ");
        map.yaml += `\t\tEnemies: ${enemies}\n`;
    }
    for (const player of players) {
        map.yaml +=
`\tPlayerReference@${player.name}:
\t\tName: ${player.name}
\t\tPlayable: True
\t\tFaction: Random
\t\tEnemies: Creeps
`;
    }
    {
        map.yaml += "Actors:\n";
        let num = 0;
        for (const entity of entities) {
            entity.type ?? die("Entity is missing type");
            entity.owner ?? die("Entity is missing owner");
            entity.x ?? die("Entity is missing location");
            entity.y ?? die("Entity is missing location");
            // +1 to x and y to compensate for out-of-bounds
            map.yaml +=
`\tActor${num++}: ${entity.type}
\t\tOwner: ${entity.owner}
\t\tLocation: ${entity.x + 1},${entity.y + 1}
`;
        }
    }

    return map;
}

export function generate() {
    if (!ready) return;

    debugDiv.replaceChildren();

    const canvas = document.getElementById("canvas");

    const saveBin = document.getElementById("saveBin");
    const saveYaml = document.getElementById("saveYaml");

    const settings = readSettings();

    const map = generateMap(settings);
    window.map = map;

    document.getElementById("description").textContent = JSON.stringify(settings, null, 2);

    const size = settings.size;

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, size, size);

    // Generate preview
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (map.resources[i] === 0) {
                ctx.fillStyle = terrainColor(map.types[i]);
            } else {
                switch (map.resources[i]) {
                case 1:
                    ctx.fillStyle = "#948060";
                    break;
                case 2:
                    ctx.fillStyle = "#8470ff";
                    break;
                default:
                    ctx.fillStyle = "black";
                    break;
                }
            }
            // ctx.fillStyle = "rgb(0, "+(map.elevation[y * size + x]*5000+128)+", 0)";
            ctx.fillRect(x, y, 1, 1);
        }
    }
    for (const player of map.players) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.fillStyle = "#808080";
        ctx.beginPath();
        ctx.arc(player.x + 0.5, player.y + 0.5, 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fill();
    }

    {
        const blob = new Blob([map.bin.data], {type: 'application/octet-stream'});
        saveBin.href = URL.createObjectURL(blob);
    }
    {
        const blob = new Blob([map.yaml], {type: 'application/octet-stream'});
        saveYaml.href = URL.createObjectURL(blob);
    }
    {
        savePng.href = canvas.toDataURL();
    }
}

const settingsMetadata = {
    seed: {init: -2024525772, type: "int"},
    size: {init: 96, type: "int"},
    rotations: {init: 2, type: "int"},
    mirror: {init: 0, type: "int"},
    playersPerRotation: {init: 1, type: "int"},

    water: {init: 0.5, type: "float"},
    terrainSmoothing: {init: 4, type: "int"},
    smoothingThreshold: {init: 0.33, type: "float"},
    minimumThickness: {init: 5, type: "int"},
    wavelengthScale: {init: 1.0, type: "float"},
    enforceSymmetry: {init: false, type: "bool"},

    createEntities: {init: true, type: "bool"},
    startingMines: {init: 3, type: "int"},
    startingOre: {init: 3, type: "int"},
    centralReservation: {init: 16, type: "int"},
    spawnRegionSize: {init: 16, type: "int"},
    spawnBuildSize: {init: 8, type: "int"},
    spawnMines: {init: 3, type: "int"},
    spawnOre: {init: 3, type: "int"},
    maxExpansions: {init: 4, type: "int"},
    minExpansionSize: {init: 2, type: "int"},
    maxExpansionSize: {init: 12, type: "int"},
    expansionInner: {init: 4, type: "int"},
    expansionBorder: {init: 4, type: "int"},
    expansionMines: {init: 0.02, type: "float"},
    expansionOre: {init: 5, type: "int"},
    rockWeight: {init: 0.1, type: "float"},
    rockSize: {init: 4, type: "int"},
    maxBuildings: {init: 3, type: "int"},
};

function camelToKebab(str) {
    return str.replaceAll(/(?=[A-Z])/g, '-').toLowerCase();
}

export function readSettings() {
    const settings = {};
    for (const settingName of Object.keys(settingsMetadata)) {
        const type = settingsMetadata[settingName].type;
        const elementName = camelToKebab(settingName);
        const el = document.getElementById(elementName) ?? die("Missing setting element ${elementName}");
        let value;
        switch (type) {
        case "int":
            value = el.value | 0;
            break;
        case "float":
            value = Number(el.value);
            break;
        case "bool":
            value = el.checked;
            break;
        default:
            die(`Unknown type ${type}`);
        }
        settings[settingName] = value;
    }
    return settings;
}

// Settings which aren't supplied are set to the default (init) values.
export function writeSettings(settings) {
    for (const settingName of Object.keys(settingsMetadata)) {
        const type = settingsMetadata[settingName].type;
        const elementName = camelToKebab(settingName);
        const el = document.getElementById(elementName) ?? die("Missing setting element ${elementName}");
        const value = settings[settingName] ?? settingsMetadata[settingName].init;
        switch (type) {
        case "int":
        case "float":
            el.value = value;
            break;
        case "bool":
            el.checked = value;
            break;
        default:
            die(`Unknown type ${type}`);
        }
    }
}

export function configurePreset(generateRandom) {
    let preset = document.getElementById("preset").value;
    document.getElementById("preset").value = "placeholder";
    if (preset === "random") {
        const randomPresets = [
            "basic",
            "plains",
            "wetlands",
            "puddles",
            "oceanic",
        ];
        preset = randomPresets[(Math.random() * randomPresets.length) | 0];
    }

    const old = readSettings();
    const settings = {
        seed: old.seed,
        size: old.size,
        rotations: old.rotations,
        mirror: old.mirror,
        playersPerRotation: old.playersPerRotation,
    };
    switch(preset) {
    case "placeholder":
        return;
    case "---":
        return;
    case "basic":
        break;
    case "plains":
        settings.water = 0.0;
        settings.wavelengthScale = 0.2;
        break;
    case "wetlands":
        settings.water = 0.5;
        settings.wavelengthScale = 0.2;
        break;
    case "wetlands-narrow":
        settings.water = 0.5;
        settings.wavelengthScale = 0.05;
        break;
    case "puddles":
        settings.water = 0.2;
        settings.wavelengthScale = 0.2;
        break;
    case "oceanic":
        settings.water = 0.8;
        settings.wavelengthScale = 0.2;
        break;
    default:
        die(`Unknown preset ${preset}`);
    }
    writeSettings(settings);
    if (generateRandom) {
        randomSeed();
        generate();
    }
}


window.generate = generate;
window.configurePreset = configurePreset;

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
        // const templatesByStartDir = [[], [], [], [], [], [], [], []];
        // const templatesByEndDir = [[], [], [], [], [], [], [], []];
        info.typeNs = {
            "Coastline": 0,
        };
        info.borderNs = [
            [0, 1, 2, 3, 4, 5, 6, 7], // 1
        ];
        info.templatesByType = {
            "Coastline": [],
        };
        for (const templateName of Object.keys(info.TemplatePaths).toSorted()) {
            const template = info.TemplatePaths[templateName];
            template.Path = template.Path.map(p => ({x: p[0] | 0, y: p[1] | 0}));
            template.PathND = template.PathND.map(p => ({x: p[0] | 0, y: p[1] | 0}));
            template.Name = templateName;
            template.StartDir = letterToDirection(template.StartDir);
            template.EndDir = letterToDirection(template.EndDir);
            template.StartBorderN = info.borderNs[info.typeNs[template.Type]][template.StartDir];
            template.EndBorderN = info.borderNs[info.typeNs[template.Type]][template.EndDir];
            template.MovesX = template.Path[template.Path.length-1].x - template.Path[0].x;
            template.MovesY = template.Path[template.Path.length-1].y - template.Path[0].y;
            template.OffsetX = template.Path[0].x;
            template.OffsetY = template.Path[0].y;
            template.Progress = template.Path.length - 1;
            template.ProgressLow = Math.ceil(template.Progress / 2);
            template.ProgressHigh = Math.floor(template.Progress * 1.5);
            info.templatesByType[template.Type].push(template);
            // templatesByStartDir[template.StartDir].push(template);
            // templatesByEndDir[template.EndDir].push(template);
            // Last point has no direction.
            for (let i = 0; i < template.PathND.length - 1; i++) {
                template.PathND[i].d = calculateDirectionPoints(template.PathND[i], template.PathND[i+1]);
            }
            template.PathND[template.PathND.length - 1].d = DIRECTION_NONE;
            template.RelPathND = template.PathND.map(p => ({
                x: p.x - template.OffsetX,
                y: p.y - template.OffsetY,
                d: p.d, // direction
                dm: 1 << p.d, // direction mask
                dmr: 1 << reverseDirection(p.d), // direction mask reverse
            }));
        }
        // info.templatesByStartDir = templatesByStartDir;
        // info.templatesByEndDir = templatesByEndDir;

        ready = true;
        writeSettings({});
        generate();
    });
