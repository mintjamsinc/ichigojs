# ichigo.js 🍓

A simple and intuitive reactive framework. Lightweight, fast, and user-friendly virtual DOM library inspired by Vue.js.

[![npm version](https://img.shields.io/npm/v/@mintjamsinc/ichigojs.svg)](https://www.npmjs.com/package/@mintjamsinc/ichigojs)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Features

- ✨ **Vue-like API** - Familiar syntax for Vue developers
- ⚡ **Reactive Proxy System** - Automatic change detection without manual triggers
- 🎯 **Computed Properties** - Automatic dependency tracking and re-evaluation
- 🔄 **Two-way Binding** - `v-model` with modifiers (`.lazy`, `.number`, `.trim`)
- 🔌 **Lifecycle Hooks** - `@mount`, `@mounted`, `@update`, `@updated`, `@unmount`, `@unmounted`
- 📦 **Lightweight** - Minimal bundle size
- 🚀 **High Performance** - Efficient batched updates via microtask queue
- 💪 **TypeScript** - Written in TypeScript with full type support
- 🎨 **Directives** - `v-if`, `v-for`, `v-show`, `v-bind`, `v-on`, `v-model`

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

#### Lifecycle Hooks

Lifecycle hooks allow you to run code at specific stages of an element's lifecycle:

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

- `@mount` - Called before the element is inserted into the DOM
- `@mounted` - Called after the element is inserted into the DOM
- `@update` - Called before the element is updated
- `@updated` - Called after the element is updated
- `@unmount` - Called before the element is removed from the DOM
- `@unmounted` - Called after the element is removed from the DOM

**Use cases:**

```javascript
methods: {
  onMounted(el) {
    // Initialize third-party library (el is the DOM element)
    const canvas = el.querySelector('canvas');
    canvas._chartInstance = new Chart(canvas.getContext('2d'), { /* ... */ });
  },
  onUpdated(el) {
    // Update chart with new data
    const canvas = el.querySelector('canvas');
    canvas._chartInstance?.update();
  },
  onUnmounted(el) {
    // Clean up resources
    const canvas = el.querySelector('canvas');
    canvas._chartInstance?.destroy();
    delete canvas._chartInstance;
  }
}
```

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

See the [docs](https://mintjamsinc.github.io/ichigojs/) for live examples:

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
