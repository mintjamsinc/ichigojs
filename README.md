# ichigo.js 🍓

A simple and intuitive reactive framework. Lightweight, fast, and user-friendly virtual DOM library inspired by Vue.js.

[![npm version](https://img.shields.io/npm/v/@mintjamsinc/ichigojs.svg)](https://www.npmjs.com/package/@mintjamsinc/ichigojs)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- ✨ **Vue-like API** - Familiar syntax for Vue developers
- ⚡ **Reactive Proxy System** - Automatic change detection without manual triggers
- 🎯 **Computed Properties** - Automatic dependency tracking and re-evaluation, including writable computed (`{ get, set }`)
- 👀 **Watchers** - React to data changes with the `watch` option (`deep`, `immediate`)
- 🔄 **Two-way Binding** - `v-model` with modifiers (`.lazy`, `.number`, `.trim`)
- 🔌 **Lifecycle Hooks** - `@mount`, `@mounted`, `@update`, `@updated`, `@unmount`, `@unmounted` with context (`$ctx`)
- 💾 **userData Storage** - Proxy-free storage for third-party library instances with auto-cleanup
- 🧩 **Components** - Reusable Web Components via `defineComponent` with `props`, `slot`, and `$emit`
- 📦 **Lightweight** - Minimal bundle size
- 🚀 **High Performance** - Efficient batched updates via microtask queue
- 💪 **TypeScript** - Written in TypeScript with full type support
- 🎨 **Directives** - `v-if`, `v-else-if`, `v-else`, `v-for`, `v-show`, `v-bind`, `v-on`, `v-model`, `v-text`, `v-html`, `v-focus`, `v-resize`, `v-intersection`, `v-performance`
- 🎯 **Focus Management** - Declarative focus control with the `v-focus` directive (`.select`, `.cursor-end`)
- 📐 **Resize Observer** - Monitor element size changes with `v-resize` directive
- 👁️ **Intersection Observer** - Detect element visibility with `v-intersection` directive
- ⚡ **Performance Observer** - Monitor performance metrics with `v-performance` directive

## Installation

```bash
npm install @mintjamsinc/ichigojs
```

### Bundle Formats

ichigo.js provides multiple bundle formats to suit different use cases:

#### ESM (ES Modules)
Use with modern bundlers or native ES modules:
```javascript
import { VDOM } from '@mintjamsinc/ichigojs';
```

**Files:**
- `dist/ichigo.esm.js` - Development build with source maps
- `dist/ichigo.esm.min.js` - Production build (minified)

#### CommonJS
Use with Node.js or older bundlers:
```javascript
const { VDOM } = require('@mintjamsinc/ichigojs');
```

**Files:**
- `dist/ichigo.cjs` - Development build with source maps
- `dist/ichigo.min.cjs` - Production build (minified)

#### UMD (Universal Module Definition)
Use via `<script>` tag in browser:
```html
<script src="node_modules/@mintjamsinc/ichigojs/dist/ichigo.umd.js"></script>
<script>
  const { VDOM } = window.ichigo;
  // Use VDOM here
</script>
```

**Files:**
- `dist/ichigo.umd.js` - Development build with source maps
- `dist/ichigo.umd.min.js` - Production build (minified)

**Note:** The UMD build exposes `window.ichigo` with all exports (`VDOM`, `ReactiveProxy`, `VComponent`, `VComponentRegistry`).

## Quick Start

```html
<!DOCTYPE html>
<html>
<body>
  <div id="app">
    <h1>{{ message }}</h1>
    <input v-model="message">
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
  </div>

  <script type="module">
    import { VDOM } from '@mintjamsinc/ichigojs';

    VDOM.createApp({
      data() {
        return {
          message: 'Hello ichigo.js!',
          count: 0
        };
      },
      methods: {
        increment() {
          this.count++;
        }
      }
    }).mount('#app');
  </script>
</body>
</html>
```

## Core Concepts

### Reactive Data

All data properties are automatically reactive. Changes are detected and DOM updates are scheduled automatically.

```javascript
VDOM.createApp({
  data() {
    return {
      count: 0,
      user: {
        name: 'Alice',
        age: 25
      },
      items: [1, 2, 3]
    };
  },
  methods: {
    updateData() {
      // All of these trigger automatic DOM updates
      this.count++;
      this.user.name = 'Bob';
      this.items.push(4);
    }
  }
}).mount('#app');
```

### Marking Objects as Non-Reactive

Use `$markRaw()` to prevent objects from being wrapped in a reactive proxy. This is useful when storing third-party library instances or large data structures that don't need reactivity.

```javascript
VDOM.createApp({
  data() {
    return {
      // Regular reactive data
      count: 0,

      // Mark as non-reactive
      chart: null,
      bigData: null
    };
  },
  methods: {
    initChart($ctx) {
      // Create Chart.js instance and mark as non-reactive
      const chartInstance = new Chart(canvas, { /* ... */ });
      this.chart = this.$markRaw(chartInstance);

      // Large dataset that doesn't need reactivity
      const data = fetchLargeDataset();
      this.bigData = this.$markRaw(data);
    }
  }
}).mount('#app');
```

**When to use `$markRaw()`:**

- Third-party library instances (Chart.js, Three.js, etc.)
- Large arrays or objects that don't need change detection
- Objects with complex internal state that shouldn't be proxied
- DOM elements or other built-in objects with internal slots

**Note:** Objects marked with `$markRaw()` won't trigger updates when modified. Use reactive properties to trigger updates when needed:

```javascript
// Update reactive trigger after modifying non-reactive data
this.bigData.push(newItem);  // Won't trigger update
this.count++;                // Triggers update
```

### Computed Properties

Computed properties automatically track their dependencies and re-evaluate when dependencies change.

```javascript
VDOM.createApp({
  data() {
    return {
      firstName: 'John',
      lastName: 'Doe'
    };
  },
  computed: {
    fullName() {
      return `${this.firstName} ${this.lastName}`;
    }
  }
}).mount('#app');
```

**Lazy (pull-based) evaluation:**

Computed properties are evaluated lazily and cached. When a dependency changes,
the dependent computed is marked stale (rather than eagerly recomputed) and is
recomputed on the next read. Because of this, reading a computed property
**synchronously after mutating a dependency returns an up-to-date value** — you
do not have to wait for the next tick:

```javascript
this.cartItems.push(item);
console.log(this.subtotal); // already reflects the new item
```

DOM updates remain batched in a microtask, so multiple synchronous mutations
still result in a single render. Each computed is recomputed at most once per
update cycle (on first read, or during the pre-render flush, whichever comes
first), and a computed whose recomputed value is unchanged does not trigger DOM
updates or watchers that depend on it. Computed→computed chains resolve
automatically and independently of declaration order.

A computed property can also be defined as an object with both a `get` and a
`set` function. This makes it writable, so it can be used as a `v-model` target
or assigned to directly. Reads go through `get`, while assignments are routed
through `set`.

```javascript
VDOM.createApp({
  data() {
    return {
      firstName: 'John',
      lastName: 'Doe'
    };
  },
  computed: {
    fullName: {
      get() {
        return `${this.firstName} ${this.lastName}`;
      },
      set(value) {
        const [first, last] = value.split(' ');
        this.firstName = first;
        this.lastName = last;
      }
    }
  }
}).mount('#app');
```

```html
<!-- Assigning through v-model invokes the computed setter -->
<input v-model="fullName">
```

### Watchers

Use the `watch` option to run a callback whenever a watched property changes.
Keys are property paths (e.g. `"count"`, `"user.name"`), and the callback
receives the new and previous values.

```javascript
VDOM.createApp({
  data() {
    return {
      count: 0,
      user: { name: 'Alice' }
    };
  },
  watch: {
    // Shorthand: a callback function
    count(newValue, oldValue) {
      console.log(`count changed from ${oldValue} to ${newValue}`);
    },

    // Watch a nested property by path
    'user.name'(newValue, oldValue) {
      console.log(`name changed from ${oldValue} to ${newValue}`);
    },

    // Full form: an options object with deep / immediate
    user: {
      handler(newValue, oldValue) {
        console.log('user object changed', newValue);
      },
      deep: true,      // Observe nested changes inside the object
      immediate: true  // Invoke once immediately with the current value
    }
  }
}).mount('#app');
```

**Watcher options:**

- `handler` - The callback invoked when the watched value changes
- `deep` - When `true`, deeply observes nested object/array changes (default: `false`)
- `immediate` - When `true`, invokes the handler once immediately on registration with the current value (default: `false`)

### Directives

#### v-if / v-else-if / v-else

Conditional rendering:

```html
<div v-if="count > 10">Count is greater than 10</div>
<div v-else-if="count > 5">Count is greater than 5</div>
<div v-else>Count is 5 or less</div>
```

#### v-for

List rendering:

```html
<ul>
  <li v-for="(item, index) in items" :key="item.id">
    {{ index }}: {{ item.name }}
  </li>
</ul>
```

##### Using `<template>` as a fragment

`v-for` and `v-if` can be placed on a `<template>` element to render
multiple nodes per iteration without introducing a wrapper element:

```html
<dl>
  <template v-for="item in items" :key="item.id">
    <dt>{{ item.term }}</dt>
    <dd>{{ item.description }}</dd>
  </template>
</dl>
```

`<template>` supports **either** `v-for` **or** `v-if` per element, but
**not both on the same `<template>`**. If you need both, either:

1. Nest them on separate `<template>` / element levels:
    ```html
    <template v-for="item in items" :key="item.id">
      <div v-if="item.visible">{{ item.name }}</div>
    </template>
    ```
2. Use a regular element instead of `<template>`:
    ```html
    <div v-for="item in items" v-if="item.visible" :key="item.id">...</div>
    ```

Combining `v-for` and `v-if` on the same element works for all
non-`<template>` tags (v-for is evaluated first, v-if per iteration).

#### v-show

Toggle visibility:

```html
<div v-show="isVisible">This can be toggled</div>
```

#### v-bind (`:`)

Bind attributes:

```html
<img :src="imageUrl" :alt="imageAlt">
<div :class="{ active: isActive }"></div>
```

#### v-on (`@`)

Event handling with modifiers:

```html
<button @click="handleClick">Click me</button>
<form @submit.prevent="handleSubmit">Submit</form>
<div @click.stop="handleClick">Stop propagation</div>
```

Event modifiers: `.stop`, `.prevent`, `.capture`, `.self`, `.once`

Key modifiers (KeyboardEvent): `.enter`, `.tab`, `.delete` (matches Delete/Backspace), `.esc` / `.escape`, `.space`, `.up`, `.down`, `.left`, `.right`

Mouse button modifiers (MouseEvent): `.left`, `.middle`, `.right`

System modifier keys (KeyboardEvent and MouseEvent): `.shift`, `.ctrl`, `.alt`, `.meta`. Add `.exact` to require that no other system modifiers are held.

```html
<!-- Shift + Click -->
<button @click.shift="onShiftClick">Shift+Click</button>

<!-- Right-click without bringing up the browser menu -->
<div @contextmenu.prevent="onMenu">Right-click me</div>

<!-- Middle-click -->
<a @mousedown.middle="onMiddleClick">Middle-click</a>

<!-- Ctrl+Click only (no other modifiers held) -->
<button @click.ctrl.exact="onCtrlClickOnly">Ctrl+Click only</button>
```

**Event Handlers with Context:**

All event handlers receive the event as the first parameter and `$ctx` as the second parameter:

```javascript
methods: {
  handleClick(event, $ctx) {
    // event - the DOM event object
    // $ctx.element - the DOM element
    // $ctx.vnode - the VNode instance
    // $ctx.userData - Proxy-free storage
  }
}
```

#### v-text

Set the text content of an element. The expression result replaces the
element's `textContent`. Unlike `v-html`, the content is rendered as plain
text, so HTML is escaped and XSS is not a concern.

```html
<span v-text="message"></span>

<!-- Equivalent to -->
<span>{{ message }}</span>
```

Use `v-text` when you want to set the entire text content of an element from a
single expression (it overwrites any existing content), rather than
interpolating with `{{ }}`.

#### v-html

Set the raw HTML content of an element. The expression result is assigned to
the element's `innerHTML`.

```html
<div v-html="htmlContent"></div>
```

> ⚠️ **Security warning:** Dynamically rendering arbitrary HTML can easily lead
> to XSS attacks. Only use `v-html` on **trusted** content, and **never** on
> user-provided content. For plain text, use `v-text` or `{{ }}` interpolation
> instead.

#### v-focus

Declaratively manage focus on an element. Focus is deferred via
`requestAnimationFrame`, so elements that become visible just before the
directive runs (for example inside a `v-if` or a `display: none` container)
still receive focus reliably.

```html
<!-- Focus once after mount -->
<input v-focus>

<!-- Focus + select all text after mount -->
<input v-focus.select>

<!-- Focus + place the caret at the end of the value -->
<input v-focus.cursor-end value="prefilled">

<!-- Conditional focus: fires when the expression goes from falsy to truthy -->
<input v-focus="isEditing">

<!-- Conditional focus + select all -->
<input v-focus.select="isEditing">
```

**Behavior:**

- **Without an expression**, the element is focused exactly once after mount.
- **With an expression**, focus fires only on the falsy → truthy edge, so the
  user is not repeatedly re-focused on every reactive update. If the value is
  already truthy on mount, the element is focused immediately.

**Modifiers:**

- `.select` - After focusing, selects all text in the input/textarea
- `.cursor-end` - After focusing, places the caret at the end of the value

#### v-resize

Monitor element size changes using ResizeObserver:

```html
<div v-resize="onResize" class="resizable-box">
  {{ width }}px × {{ height }}px
</div>
```

```javascript
methods: {
  onResize(entries, $ctx) {
    const entry = entries[0];
    this.width = Math.round(entry.contentRect.width);
    this.height = Math.round(entry.contentRect.height);

    // Access element through $ctx
    console.log('Element:', $ctx.element);
  }
}
```

**With custom options:**

```html
<div v-resize="onResize"
     :options.resize="{box: 'border-box'}">
  Observe border-box dimensions
</div>
```

You can also use `:options` for generic options:

```html
<div v-resize="onResize"
     :options="{box: 'content-box'}">
  Resizable content
</div>
```

**Features:**
- Native ResizeObserver API for efficient resize detection
- Custom box model via `:options.resize` or `:options`
- Automatic cleanup in destroy phase
- Access to element, VNode, and userData via `$ctx`

#### v-intersection

Detect element visibility using IntersectionObserver:

```html
<div v-intersection="onIntersection" class="observable-box">
  I'm {{ isVisible ? 'VISIBLE' : 'NOT VISIBLE' }}
</div>
```

```javascript
methods: {
  onIntersection(entries, $ctx) {
    const entry = entries[0];
    this.isVisible = entry.isIntersecting;
    this.intersectionRatio = entry.intersectionRatio;

    // Access element through $ctx
    console.log('Element:', $ctx.element);
  }
}
```

**With custom options:**

```html
<div v-intersection="onIntersection"
     :options.intersection="{threshold: 0.5, rootMargin: '0px'}">
  Triggers at 50% visibility
</div>
```

You can also use `:options` for generic options:

```html
<div v-intersection="onIntersection"
     :options="{threshold: 0.5}">
  Observable content
</div>
```

**Features:**
- Native IntersectionObserver API for efficient visibility detection
- Custom threshold and rootMargin options via `:options.intersection` or `:options`
- Automatic cleanup in destroy phase
- Perfect for lazy loading, infinite scroll, and animation triggers
- Access to element, VNode, and userData via `$ctx`

#### v-performance

Monitor performance metrics using PerformanceObserver:

```html
<div v-performance="onPerformance">
  Performance monitoring
</div>
```

```javascript
methods: {
  onPerformance(entries, observer, options, $ctx) {
    entries.getEntries().forEach(entry => {
      console.log(`${entry.name}: ${entry.duration}ms`);
    });

    // Access dropped entries count if available
    if (options?.droppedEntriesCount) {
      console.log(`Dropped: ${options.droppedEntriesCount}`);
    }
  }
}
```

**With custom options:**

```html
<div v-performance="onPerformance"
     :options.performance="{entryTypes: ['measure', 'mark']}">
  Observe only measures and marks
</div>
```

You can also use `:options` for generic options:

```html
<div v-performance="onPerformance"
     :options="{type: 'navigation', buffered: true}">
  Performance monitoring
</div>
```

**Features:**
- Native PerformanceObserver API for monitoring performance metrics
- Custom entry types and options via `:options.performance` or `:options`
- Automatic cleanup in destroy phase
- Monitor marks, measures, navigation, resource timing, and more
- Access to element, VNode, and userData via `$ctx`

#### Lifecycle Hooks

Lifecycle hooks allow you to run code at specific stages of an element's lifecycle. Each hook receives a **lifecycle context** (`$ctx`) with access to the element, VNode, and userData storage.

```html
<div v-if="show"
     @mount="onMount"
     @mounted="onMounted"
     @update="onUpdate"
     @updated="onUpdated"
     @unmount="onUnmount"
     @unmounted="onUnmounted">
  Content
</div>
```

**Available hooks:**

- `@mount` - Called before the VNode is mounted to the DOM element
- `@mounted` - Called after the VNode is mounted to the DOM element
- `@update` - Called before the element is updated
- `@updated` - Called after the element is updated
- `@unmount` - Called before VNode cleanup begins
- `@unmounted` - Called after VNode cleanup is complete (element reference still available)

**Lifecycle Context (`$ctx`):**

Every lifecycle hook receives a context object with:

- `$ctx.element` - The DOM element
- `$ctx.vnode` - The VNode instance
- `$ctx.userData` - Proxy-free storage Map for user data

**userData Storage:**

`$ctx.userData` is a safe space to store data associated with the element's lifecycle. It's not affected by the reactive proxy system, making it perfect for storing third-party library instances.

```javascript
methods: {
  onMounted($ctx) {
    // Initialize third-party library
    const canvas = $ctx.element.querySelector('canvas');
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { /* ... */ }
    });

    // Store in userData (Proxy-free storage)
    $ctx.userData.set('chart', chart);
  },

  onUpdated($ctx) {
    // Retrieve from userData
    const chart = $ctx.userData.get('chart');
    if (chart) {
      chart.data.labels = [...this.labels];
      chart.update();
    }
  },

  onUnmount($ctx) {
    // Clean up before removal
    const chart = $ctx.userData.get('chart');
    if (chart) {
      chart.destroy();
      $ctx.userData.delete('chart');
    }
  }
}
```

**Automatic Cleanup:**

Objects with a `close()` method stored in `userData` are automatically cleaned up during the destroy phase:

```javascript
methods: {
  onMounted($ctx) {
    // Object with close() method
    const resource = {
      data: someData,
      close() {
        // Custom cleanup logic
        console.log('Resource cleaned up');
      }
    };

    $ctx.userData.set('myResource', resource);
    // resource.close() will be called automatically during destroy phase
  }
}
```

**Cleanup Order:**

1. `@unmount` hook fires (element still in DOM)
2. `userData` auto-cleanup (close() methods called)
3. Child nodes destroyed recursively
4. Dependencies unregistered
5. Directive manager cleanup
6. `@unmounted` hook fires (element removed from DOM, but reference still available in `$ctx.element`)

**Works with v-if and v-for:**

```html
<!-- With v-if: hooks called on show/hide -->
<div v-if="isVisible" @mounted="onShow" @unmounted="onHide">
  Conditional content
</div>

<!-- With v-for: hooks called for each item -->
<div v-for="item in items"
     :key="item.id"
     @mounted="onItemAdded"
     @unmounted="onItemRemoved">
  {{ item.name }}
</div>
```

#### v-model

Two-way data binding:

```html
<!-- Text input -->
<input v-model="message">

<!-- With modifiers -->
<input v-model.lazy="message">        <!-- Update on change instead of input -->
<input v-model.number="age">          <!-- Convert to number -->
<input v-model.trim="username">       <!-- Trim whitespace -->

<!-- Checkbox (boolean) -->
<input type="checkbox" v-model="isChecked">

<!-- Checkbox with custom true/false values -->
<input type="checkbox" v-model="status" :true-value="'yes'" :false-value="'no'">

<!-- Checkbox group bound to an array -->
<input type="checkbox" value="a" v-model="selectedItems">
<input type="checkbox" value="b" v-model="selectedItems">

<!-- Radio -->
<input type="radio" value="a" v-model="picked">
<input type="radio" value="b" v-model="picked">

<!-- Select -->
<select v-model="selected">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

**Supported elements:**

- **Text inputs / `<textarea>`** - Binds to the element's value
- **Checkbox** - Binds to a boolean, to a custom value pair via `:true-value` / `:false-value`, or to an array (when the bound value is an array, the checkbox's `value` is added/removed)
- **Radio** - Binds to the `value` (or `:value`) of the selected radio button
- **Select** - Binds to the selected option's value (re-applied automatically when options are generated dynamically via `v-for`)

### Methods

Methods have access to data and computed properties via `this`:

```javascript
VDOM.createApp({
  data() {
    return {
      count: 0
    };
  },
  methods: {
    increment() {
      this.count++;
    },
    reset() {
      this.count = 0;
    }
  }
}).mount('#app');
```

### $nextTick

Execute code after DOM updates:

```javascript
methods: {
  updateData() {
    this.message = 'Updated';

    this.$nextTick(() => {
      console.log('DOM has been updated');
    });
  }
}
```

## Components

ichigo.js components are real [Custom Elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
backed by the same reactivity system. Define a component with `defineComponent`,
pointing it at a `<template>` for its markup.

```html
<!-- Component markup -->
<template id="my-list">
  <ul v-if="items.length > 0">
    <li v-for="item of items" :key="item.id">{{ item.name }}</li>
  </ul>
  <!-- Fallback content projected from the parent -->
  <slot></slot>
</template>
```

```javascript
import { defineComponent } from '@mintjamsinc/ichigojs';

defineComponent('my-list', {
  template: '#my-list',     // CSS selector for the <template>
  props: ['items'],         // Props received from the parent
  data() {
    // Props are accessible via `this` and can be defaulted/transformed here
    return { items: this.items ?? [] };
  }
});
```

```html
<!-- Usage -->
<my-list :items="searchResults">
  <span slot="empty">No results.</span>
</my-list>
```

**Props:**

- Declared via the `props` array. Each declared prop becomes a property on the
  custom element, so the parent can bind to it with `v-bind` / `:`
  (e.g. `:items="searchResults"`).
- Props are reactive from the start and are included in the component's data
  automatically. Values returned from `data()` take precedence, allowing you to
  default or transform a prop (e.g. `this.items ?? []`).

**Slots:**

Use the native `<slot>` element in the component template to project content
from the parent. ichigo.js components use Light DOM.

### Events (`$emit`)

Components (and applications) can dispatch custom events with `$emit`, which is
available in both templates and methods. By default the event bubbles from the
component's root element, so a parent can listen for it with `v-on` / `@` on the
component tag.

```javascript
defineComponent('my-button', {
  template: '#my-button',
  // Optional: declare the events this component emits.
  // Emitting an undeclared event logs a development warning (validation only;
  // it never blocks dispatch). Omit `emits` to allow any event name.
  emits: ['selected'],
  methods: {
    onClick() {
      // $emit(name, detail?, options?)
      this.$emit('selected', { id: 42 });
    }
  }
});
```

```html
<!-- Parent listens for the custom event; payload is in event.detail -->
<my-button @selected="onSelected"></my-button>
```

**`$emit(name, detail?, options?)`:**

- `name` - The event name (listened to as `@name` on the parent)
- `detail` - The payload exposed as `event.detail`
- `options` - Dispatch options (`VEmitOptions`):
  - `bubbles` - Whether the event bubbles (default: `true`)
  - `cancelable` - Whether `preventDefault()` has an effect (default: `true`); `$emit` returns `false` when a listener calls `preventDefault()`
  - `composed` - Whether the event crosses shadow DOM boundaries (default: `false`)
  - `target` - The dispatch target (default: the application root element). Set to `document` / `window` for a global event bus.

### Legacy component directive (`v-component`)

> ⚠️ **Deprecated.** The `v-component` directive and the `VComponentRegistry`
> are deprecated and will be removed in a future release. Use
> [`defineComponent`](#components) (Custom Elements) for new code.

For reference, the legacy mechanism renders a component registered in the
application's `VComponentRegistry` by id, passing props through `:options`:

```html
<div v-component="my-component" :options="{ message: 'Hello' }"></div>
```

## Performance

ichigo.js uses several optimization techniques:

- **Microtask batching**: Multiple synchronous changes result in a single DOM update
- **Efficient change tracking**: Only changed properties trigger re-evaluation
- **Lazy computed caching**: Computed properties are pull-based — they re-evaluate only when a dependency changes and the value is actually read, at most once per update cycle

Benchmark (1000 item list update): **~6.8ms** ⚡

## Browser Support

- Modern browsers with ES2020+ support
- Requires `Proxy`, `queueMicrotask`, and other modern JavaScript features

## TypeScript Support

ichigo.js is written in TypeScript and provides full type definitions:

```typescript
import { VDOM } from '@mintjamsinc/ichigojs';

interface AppData {
  count: number;
  message: string;
}

VDOM.createApp<AppData>({
  data() {
    return {
      count: 0,
      message: 'Hello'
    };
  }
}).mount('#app');
```

## Examples

See the [docs](https://www.mintjams.jp/ichigojs/) for live examples:

- **Basic Usage** - Getting started with ichigo.js
- **Todo List** - Complete task management application
- **Component System** - Reusable components with props and events
- **Advanced Features**:
  - **Lifecycle Hooks** - CSS animations and Chart.js integration
  - **Anime.js Integration** - Particle animations and morphing shapes
  - **Chart.js Integration** - Dynamic charts with automatic updates

## API Reference

### VDOM.createApp(options)

Creates a new application instance.

**Options:**

- `data()`: Function that returns the initial data object. Called with a `$ctx` (`{ $markRaw }`) as `this`.
- `computed`: Object containing computed property definitions. Each value is either a getter function (read-only) or a `{ get, set }` object (writable).
- `methods`: Object containing method definitions
- `watch`: Object mapping property paths to watcher definitions (a callback, or `{ handler, deep, immediate }`)
- `emits`: Optional array of event names the app/component is expected to emit via `$emit`. Emitting an undeclared event logs a development warning (validation only).
- `logLevel`: Logging level (`'debug'` | `'info'` | `'warn'` | `'error'`)

**Returns:** Application instance with `mount(selector)` method

**Instance helpers** (available in `data()`, methods, expressions, and lifecycle hooks as appropriate):

- `$markRaw(obj)`: Marks an object as non-reactive (see [Marking Objects as Non-Reactive](#marking-objects-as-non-reactive))
- `$nextTick(callback)`: Runs a callback after the next DOM update
- `$emit(name, detail?, options?)`: Dispatches a custom event (see [Events](#events-emit))
- `$ctx`: Lifecycle/handler context with `element`, `vnode`, and `userData`

### defineComponent(tagName, options)

Defines and registers a custom element backed by ichigo.js reactivity. See [Components](#components).

**Options** (extends the `createApp` options above):

- `template`: CSS selector for the `<template>` element that defines the component's markup (required)
- `props`: Array of property names received from the parent via attribute/property binding

**Returns:** `void` (the custom element is registered via `customElements.define`)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - Copyright (c) 2025 MintJams Inc.

## Credits

Inspired by [Vue.js](https://vuejs.org/) - A progressive JavaScript framework.

---

Built with ❤️ by [MintJams Inc.](https://github.com/mintjamsinc)
