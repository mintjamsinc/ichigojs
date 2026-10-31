// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * The effects that read one member of one object.
 */
type ReactiveDep = Set<ReactiveEffect>;

/**
 * A unit of work that depends on what it reads: a rendered binding, a computed property
 * or a watcher. While it runs, every member it reads is recorded against it; a later
 * write to one of those members notifies it.
 *
 * A dependency is the object and the key themselves, not a name for them. However a
 * value is reached (a v-for variable, a held reference, a computed's result, a prop) and
 * wherever an array has moved it to, it is the same dependency, so a write finds its
 * readers with one lookup.
 */
export class ReactiveEffect {
    /**
     * The key standing for the set of members of an object: what enumerating it reads,
     * and what adding or removing a member changes.
     */
    static readonly ITERATE: unique symbol = Symbol('iterate');

    /**
     * The dependency table: object -> key -> the effects that read that member.
     */
    private static deps = new WeakMap<object, Map<PropertyKey, ReactiveDep>>();

    /**
     * The effect that is running, or undefined when reads are not being recorded.
     */
    private static active?: ReactiveEffect;

    /**
     * The effect's work.
     */
    #fn: () => void;

    /**
     * Called when something the effect read has changed.
     */
    #schedule: (effect: ReactiveEffect) => void;

    /**
     * The dependencies the effect is registered in, to leave them before running again.
     */
    #dependencies: Set<ReactiveDep> = new Set();

    /**
     * Whether the effect is itself read by others and passes staleness on before it knows
     * its new value (see {@link invalidate}): a computed property.
     */
    #lazy: boolean;

    /**
     * Whether the effect has been stopped.
     */
    #stopped: boolean = false;

    /**
     * Creates an effect. It records nothing until it runs.
     * @param fn The effect's work.
     * @param schedule Called when something the effect read has changed.
     * @param lazy Whether a computed property: see {@link invalidate}.
     */
    constructor(fn: () => void, schedule: (effect: ReactiveEffect) => void, lazy: boolean = false) {
        this.#fn = fn;
        this.#schedule = schedule;
        this.#lazy = lazy;
    }

    /**
     * Records a read of a member against the running effect, if any.
     * @param target The raw object read from.
     * @param key The member read.
     */
    static track(target: object, key: PropertyKey): void {
        const effect = this.active;
        if (!effect) {
            return;
        }
        let keys = this.deps.get(target);
        if (!keys) {
            keys = new Map();
            this.deps.set(target, keys);
        }
        let dep = keys.get(key);
        if (!dep) {
            dep = new Set();
            keys.set(key, dep);
        }
        dep.add(effect);
        effect.#dependencies.add(dep);
    }

    /**
     * Notifies the effects that read a member.
     * @param target The raw object written to.
     * @param key The member written.
     */
    static trigger(target: object, key: PropertyKey): void {
        const dep = this.deps.get(target)?.get(key);
        if (dep) {
            this.#notify(dep);
        }
    }

    /**
     * Notifies every effect that read any member of an object. For a change that a
     * collection's own method made to the raw object, where no single member can be named.
     * @param target The raw object changed.
     */
    static triggerAll(target: object): void {
        const keys = this.deps.get(target);
        if (keys) {
            for (const dep of keys.values()) {
                this.#notify(dep);
            }
        }
    }

    /**
     * Notifies the computed properties that read a member, and only those. A computed that
     * has gone stale does not know yet whether its value changes, so what renders it waits;
     * but a computed that reads it must be stale at once, for a synchronous read to be fresh.
     * @param target The raw object holding the stale computed.
     * @param key The computed's name.
     */
    static invalidate(target: object, key: PropertyKey): void {
        const dep = this.deps.get(target)?.get(key);
        if (dep) {
            for (const effect of dep) {
                if (effect.#lazy && effect !== this.active) {
                    effect.#schedule(effect);
                }
            }
        }
    }

    /**
     * Runs a function with reads not recorded against the running effect: work that
     * happens while an effect runs but is not part of what the effect depends on, such as
     * compiling the clones a v-for creates.
     * @param fn The function to run.
     * @returns The value fn returns.
     */
    static untracked<T>(fn: () => T): T {
        const previous = this.active;
        this.active = undefined;
        try {
            return fn();
        } finally {
            this.active = previous;
        }
    }

    static #notify(dep: ReactiveDep): void {
        for (const effect of dep) {
            // An effect does not re-run for what it writes itself
            if (effect !== this.active) {
                effect.#schedule(effect);
            }
        }
    }

    /**
     * Runs the effect, replacing what it depends on with what this run reads: a branch
     * not taken or an index that has moved on is dropped.
     */
    run(): void {
        if (this.#stopped) {
            return;
        }
        this.#leaveDependencies();
        const previous = ReactiveEffect.active;
        ReactiveEffect.active = this;
        try {
            this.#fn();
        } finally {
            ReactiveEffect.active = previous;
        }
    }

    /**
     * Stops the effect for good: it leaves every dependency and never runs again.
     */
    stop(): void {
        this.#stopped = true;
        this.#leaveDependencies();
    }

    #leaveDependencies(): void {
        for (const dep of this.#dependencies) {
            dep.delete(this);
        }
        this.#dependencies.clear();
    }
}
