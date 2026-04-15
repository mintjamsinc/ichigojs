// Copyright (c) 2025 MintJams Inc. Licensed under MIT License.

/**
 * Represents a contiguous range of DOM nodes that conceptually belong to a single VNode
 * whose source is a <template> element (and therefore expands to multiple sibling nodes
 * when inserted into the DOM).
 *
 * The range is bounded by two comment markers (start and end). All nodes between the
 * markers (inclusive) form the range. Move and remove operations always act on the
 * entire range atomically via the DOM Range API, which prevents the marker pair from
 * becoming desynchronized from the content it bounds.
 *
 * This abstraction replaces ad-hoc per-marker bookkeeping previously stored in
 * {@link VNode.userData} by directives such as v-for and v-if.
 */
export class VFragmentRange {
    readonly #start: Comment;
    readonly #end: Comment;

    private constructor(start: Comment, end: Comment) {
        this.#start = start;
        this.#end = end;
    }

    /**
     * Inserts content into a parent before the given reference sibling (or as last
     * child when {@code refSibling} is null), wrapping it with start/end comment
     * markers. Returns a {@link VFragmentRange} that tracks the inserted region.
     *
     * @param parent      The parent node to insert into.
     * @param refSibling  The sibling to insert before (null = append).
     * @param label       A short label used for the marker comment text (helps debugging).
     * @param content     The content to insert. Typically a DocumentFragment cloned
     *                    from a template's content, but any Node works.
     */
    static insert(
        parent: Node,
        refSibling: Node | null,
        label: string,
        content: Node
    ): VFragmentRange {
        const start = document.createComment(`#${label}-start`);
        const end = document.createComment(`#${label}-end`);

        parent.insertBefore(start, refSibling);
        parent.insertBefore(end, refSibling);
        parent.insertBefore(content, end);

        return new VFragmentRange(start, end);
    }

    /**
     * The start marker (inclusive boundary).
     */
    get firstNode(): Comment {
        return this.#start;
    }

    /**
     * The end marker (inclusive boundary).
     */
    get lastNode(): Comment {
        return this.#end;
    }

    /**
     * Move the entire range (start marker through end marker, inclusive) to be
     * inserted before {@code refSibling} under {@code parent}. If {@code refSibling}
     * is null the range is appended.
     *
     * Implemented via the DOM Range API so that all nodes between the markers move
     * together as a single contiguous block, regardless of how many or which kinds
     * of nodes currently sit between them.
     */
    moveBefore(parent: Node, refSibling: Node | null): void {
        // No-op if already in the desired position
        if (refSibling === this.#start) {
            return;
        }

        const range = this.#asDomRange();
        const fragment = range.extractContents();
        parent.insertBefore(fragment, refSibling);
        range.detach();
    }

    /**
     * Remove the entire range (start marker through end marker, inclusive) from its
     * current parent. Safe to call even if the markers are already detached.
     */
    remove(): void {
        if (!this.#start.parentNode) {
            return;
        }

        const range = this.#asDomRange();
        range.deleteContents();
        range.detach();
    }

    /**
     * Builds a DOM {@link Range} that spans from immediately before the start marker
     * to immediately after the end marker, covering both markers and everything
     * between them.
     */
    #asDomRange(): Range {
        const range = document.createRange();
        range.setStartBefore(this.#start);
        range.setEndAfter(this.#end);
        return range;
    }
}
