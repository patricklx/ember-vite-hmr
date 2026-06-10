import { LinkTo } from '@ember/routing';

<template>
  <h1 class="equipment-page">Equipment</h1>
  <p>groupBy: {{this.groupBy}}</p>
  <LinkTo @route="project">Go to project &rarr;</LinkTo>
</template>
