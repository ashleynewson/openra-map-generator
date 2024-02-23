export default class LayeredArray {
    constructor(base) {
        this.base = base;
        this.over = new Array(base.length);
        return new Proxy(this, {
            get: function(target, name) {
                return name in target ? target[name] : target.get(name);
            },
            set: function(target, name, value) {
                if (name in target) {
                    target[name] = value;
                } else {
                    target.set(name, value);
                }
                return true;
            },
        });
    }
    get(i) {
        if (i in this.over) {
            return this.over[i];
        } else {
            return this.base[i];
        }
    }
    set(i, v) {
        this.over[i] = v;
    }
    merge() {
        for (const i in this.over) {
            if (Object.hasOwn(this.over, i)) {
                this.base[i] = this.over[i];
            }
        } 
    }
    rebase(base) {
        this.base = base;
    }
}
