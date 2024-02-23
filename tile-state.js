import LayeredArray from './layered-array.js';
import PriorityArray from './priority-array.js';

const tileErrorPenalty = 5;
const maxCandidates = 3;

export default class TileState {
    constructor(size, base) {
        base ??= null;
        this.base = base;
        this.size = size;
        if (base !== null) {
            this.tiles = new LayeredArray(base.tiles);
            // V and H are perhaps confusingly the wrong way round?
            //
            // H corresponds to L and R connections, but that's
            // technically a visually vertical border.
            this.hEdges = new LayeredArray(base.hEdges);
            this.vEdges = new LayeredArray(base.vEdges);
            this.priorities = new PriorityArray(size * size, base.priorities);
            this.progress = base.progress;
            this.error = base.error;
            this.rank = base.rank;
        } else {
            this.tiles = new Array(size * size).fill(null);
            this.hEdges = new Array(size * size).fill(null);
            this.vEdges = new Array(size * size).fill(null);
            this.priorities = new PriorityArray(size * size);
            this.progress = 0;
            this.error = 0;
            this.rank = 0;
        }
        this.candidates = null;
        this.searchDepth = 0;
    }

    updatePriorityAt(x, y, biases, info) {
        const i = y * this.size + x;
        if (this.tiles[i] !== null) {
            this.priorities.get(i) === 0 || die("set tile has non-zero priority");
            return;
        }
        let totalBiases = 0;
        for (const bias of Object.values(biases)) {
            if (bias[i] !== 0) {
                totalBiases++;
            }
        }
        if (totalBiases === 0) {
            die("unbiased cell");
        }
        let beachBonus = biases.Beach[i] !== 0 ? 1 : 0;
        // let totalBias = 0;
        // for (const bias of Object.values(biases)) {
        //     totalBias += bias[i];
        // }
        // if (totalBias === 0) {
        //     die("unbiased cell");
        // }

        const edgeSets = [];
        if (x > 0) {
            if (this.hEdges[i-1] !== null) {
                edgeSets.push(info.edges[this.hEdges[i-1]].R);
            }
        }
        if (x < this.size - 1) {
            if (this.hEdges[i] !== null) {
                edgeSets.push(info.edges[this.hEdges[i]].L);
            }
        }
        // Is U -1 or +1?
        if (y > 0) {
            if (this.vEdges[i-this.size] !== null) {
                edgeSets.push(info.edges[this.vEdges[i-this.size]].D);
            }
        }
        if (y < this.size - 1) {
            if (this.vEdges[i] !== null) {
                edgeSets.push(info.edges[this.vEdges[i]].U);
            }
        }
        let possibleTiles;
        if (edgeSets.length === 0) {
            possibleTiles = info.tileCount;
        } else if (edgeSets.length === 1) {
            possibleTiles = edgeSets[0].size;
        } else {
            // If available, replace with Set.intersection().
            const overlap = edgeSets.pop();
            for (const edgeSet of edgeSets) {
                for (const edge of overlap) {
                    if (!edgeSet.has(edge)) {
                        overlap.delete(edge);
                    }
                }
            }
            possibleTiles = overlap.size;
        }
        
        let priority = beachBonus + totalBiases / (possibleTiles + 1);
        // let priority = 1 / totalBias / (possibleTiles + 1);
        this.priorities.set(i, priority);
    }

    collapseAt(cx, cy, ctiIndex, biases, info) {
        const self = this;
        const touched = new Set();
        const unresolved = [];
        const priorityUpdates = new Set();
        const queue = function(x, y, tiIndex) {
            const i = y * self.size + x;
            if (!touched.has(i)) {
                touched.add(i);
                unresolved.push([x, y, tiIndex]);
            }
        }
        queue(cx, cy, ctiIndex);
        const setTile = function(x, y, tiIndex) {
            const i = y * self.size + x;
            self.tiles[i] = tiIndex;
            self.priorities.set(i, 0);
            const tileInfo = info.TileInfo[tiIndex];
            let biasError = 0;
            for (const bias of Object.entries(biases)) {
                if (!tileInfo.AllTypes.has(bias[0])) {
                    biasError += bias[1][i];
                }
                // if (bias[0] === tileInfo.Type) {
                //     biasError -= bias[1][i];
                // } else {
                //     // if (tileInfo.Type === "Beach") {
                //     //     if ((bias[0] === "Clear" || bias[0] === "Water") && bias[1] <= 1) {
                //     //         biasError += bias[1][i] * 0.5;
                //     //         continue;
                //     //     }
                //     // }
                //     biasError += bias[1][i];
                // }
            }
            if (biasError > 0) {
                self.error += biasError;
            }
            if (x > 0) {
                if (self.hEdges[i-1] === null) {
                    self.hEdges[i-1] = tileInfo.L;
                    if (info.uniqueEdges[tileInfo.L].L !== null) {
                        queue(x-1, y  , info.uniqueEdges[tileInfo.L].L);
                    } else {
                        priorityUpdates.add(i-1);
                    }
                } else if (self.hEdges[i-1] !== tileInfo.L) {
                    self.error += tileErrorPenalty;
                }
            }
            if (x < self.size - 1) {
                if (self.hEdges[i] === null) {
                    self.hEdges[i] = tileInfo.R;
                    if (info.uniqueEdges[tileInfo.R].R !== null) {
                        queue(x+1, y  , info.uniqueEdges[tileInfo.R].R);
                    } else {
                        priorityUpdates.add(i+1);
                    }
                } else if (self.hEdges[i] !== tileInfo.R) {
                    self.error += tileErrorPenalty;
                }
            }
            // Is U -1 or +1?
            if (y > 0) {
                if (self.vEdges[i-self.size] === null) {
                    self.vEdges[i-self.size] = tileInfo.U;
                    if (info.uniqueEdges[tileInfo.U].U !== null) {
                        queue(x  , y-1, info.uniqueEdges[tileInfo.U].U);
                    } else {
                        priorityUpdates.add(i-self.size);
                    }
                } else if (self.vEdges[i-self.size] !== tileInfo.U) {
                    self.error += tileErrorPenalty;
                }
            }
            if (y < self.size - 1) {
                if (self.vEdges[i] === null) {
                    self.vEdges[i] = tileInfo.D;
                    if (info.uniqueEdges[tileInfo.D].D !== null) {
                        queue(x  , y+1, info.uniqueEdges[tileInfo.D].D);
                    } else {
                        priorityUpdates.add(i+self.size);
                    }
                } else if (self.vEdges[i] !== tileInfo.D) {
                    self.error += tileErrorPenalty;
                }
            }
            self.progress++;
        }
        for (
            let next = unresolved.pop();
            typeof(next) !== "undefined";
            next = unresolved.pop()
        ) {
            setTile(...next);
        }
        for (const updateI of priorityUpdates) {
            const y = (updateI / this.size) | 0;
            const x = updateI % this.size;
            this.updatePriorityAt(x, y, biases, info);
        }
    }

    updateRank() {
        if (this.candidates === null || this.candidates.length === 0) {
            this.rank = this.progress - this.error * 8;
        } else {
            this.rank = this.candidates[0].rank;
        }
    }

    generateCandidates(biases, info, shortlistSize) {
        const pI = this.priorities.getMaxIndex();
        const pY = (pI / this.size) | 0;
        const pX = pI % this.size;
        const candidates = [];
        for (const tiIndex of info.sortedIndices) {
            const candidate = new TileState(this.size, this);
            candidate.collapseAt(pX, pY, tiIndex, biases, info);
            candidate.updateRank();
            candidates.push(candidate);
        }
        candidates.sort((a,b)=>(b.rank - a.rank));
        if (candidates.length > shortlistSize) {
            candidates.length = shortlistSize;
        }
        this.candidates = candidates;
    }

    search(depth, maxProgress, biases, info) {
        if (this.searchDepth >= depth) {
            return;
        }
        this.searchDepth = depth;
        if (this.progress >= maxProgress) {
            return;
        }
        if (this.candidates === null) {
            this.generateCandidates(biases, info, maxCandidates);
        }
        for (const candidate of this.candidates) {
            candidate.search(depth - 1, maxProgress, biases, info);
        }
        this.candidates.sort((a,b)=>(b.rank - a.rank));
        this.updateRank();
    }

    // merge this down and rebase children
    commit() {
        this.merge();
        if (this.candidates !== null) {
            for (const candidate of this.candidates) {
                candidate.rebase(this.base);
            }
        }
    }
    merge() {
        this.base ?? die("TileState not based");
        this.tiles.merge();
        this.hEdges.merge();
        this.vEdges.merge();
        this.priorities.merge();
        this.base.progress = this.progress;
        this.base.error = this.error;
        this.base.candidates = this.candidates;
        this.base.rank = this.rank;
        this.base.searchDepth = this.searchDepth;
    }
    rebase(base) {
        this.base ?? die("TileState not based");
        base === this.base.base || die("new base isn't base's ancestor");
        this.base = base;
        this.tiles.rebase(base.tiles);
        this.hEdges.rebase(base.hEdges);
        this.vEdges.rebase(base.vEdges);
        this.priorities.rebase(base.priorities);
    }
}
