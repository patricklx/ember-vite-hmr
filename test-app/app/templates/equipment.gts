import { LinkTo } from '@ember/routing';
import Greeting from '../components/greeting';
import ResourceHolder from '../components/resource-holder';

<template>
  <h1 class="equipment-page">Equipment</h1>
  <p>groupBy: {{this.groupBy}}</p>
  <Greeting />
  <ResourceHolder />
  <LinkTo @route="project">Go to project &rarr;</LinkTo>
</template>
