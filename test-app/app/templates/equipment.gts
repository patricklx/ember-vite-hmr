import { LinkTo } from '@ember/routing';
import Greeting from '../components/greeting';

<template>
  <h1 class="equipment-page">Equipment</h1>
  <p>groupBy: {{this.groupBy}}</p>
  <Greeting />
  <LinkTo @route="project">Go to project &rarr;</LinkTo>
</template>
