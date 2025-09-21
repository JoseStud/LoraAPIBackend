<template>
  <div class="p-4 bg-blue-100 border border-blue-300 rounded-lg">
    <h2 class="text-xl font-bold text-blue-800">Hello from Vue!</h2>
    <p class="text-blue-600">{{ message }}</p>
  </div>
  
</template>

<script setup>
import { ref } from 'vue';
const message = ref('This is our first Vue island.');
</script>

