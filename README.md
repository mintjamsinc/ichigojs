# ichigo.js 🍓

A simple and intuitive reactive framework. Lightweight, fast, and user-friendly virtual DOM library inspired by Vue.js.

[![npm version](https://img.shields.io/npm/v/@mintjamsinc/ichigojs.svg)](https://www.npmjs.com/package/@mintjamsinc/ichigojs)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- ✨ **Vue-like API** - Familiar syntax for Vue developers
- ⚡ **Reactive Proxy System** - Automatic change detection without manual triggers
- 🎯 **Computed Properties** - Automatic dependency tracking and re-evaluation
- 🔄 **Two-way Binding** - `v-model` with modifiers (`.lazy`, `.number`, `.trim`)
- 🔌 **Lifecycle Hooks** - `@mount`, `@mounted`, `@update`, `@updated`, `@unmount`, `@unmounted` with context (`$ctx`)
- 💾 **userData Storage** - Proxy-free storage for third-party library instances with auto-cleanup
- 📦 **Lightweight** - Minimal bundle size
- 🚀 **High Performance** - Efficient batched updates via microtask queue
- 💪 **TypeScript** - Written in TypeScript with full type support
- 🎨 **Directives** - `v-if`, `v-for`, `v-show`, `v-bind`, `v-on`, `v-model`, `v-resize`, `v-intersection`, `v-performance`
- 📐 **Resize Observer** - Monitor element size changes with `v-resize` directive
- 👁️ **Intersection Observer** - Detect element visibility with `v-intersection` directive
- ⚡ **Performance Observer** - Monitor performance metrics with `v-performance` directive

## Installation

```bash
npm install @mintjamsinc/ichigojs
```

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

Supported modifiers: `.stop`, `.prevent`, `.capture`, `.self`, `.once`

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

<!-- Checkbox -->
<input type="checkbox" v-model="isChecked">

<!-- Select -->
<select v-model="selected">
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

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

## Performance

ichigo.js uses several optimization techniques:

- **Microtask batching**: Multiple synchronous changes result in a single DOM update
- **Efficient change tracking**: Only changed properties trigger re-evaluation
- **Smart computed caching**: Computed properties only re-evaluate when dependencies change

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

- `data()`: Function that returns the initial data object
- `computed`: Object containing computed property definitions
- `methods`: Object containing method definitions
- `logLevel`: Logging level (`'debug'` | `'info'` | `'warn'` | `'error'`)

**Returns:** Application instance with `mount(selector)` method

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - Copyright (c) 2025 MintJams Inc.

## Credits

Inspired by [Vue.js](https://vuejs.org/) - A progressive JavaScript framework.

---

Built with ❤️ by [MintJams Inc.](https://github.com/mintjamsinc)
