import { LinkTo } from '@ember/routing';
import Greeting from '../components/greeting';
import BlockChild from '../components/block-child';
import ResourceHolder from '../components/resource-holder';

<template>
  <h1 class="equipment-page">Equipment</h1>
  <p>groupBy: {{this.groupBy}}</p>
  <Greeting />
  <BlockChild>
    <:default>block default content</:default>
    <:footer>block footer content</:footer>
    <:header>block header content</:header>
  </BlockChild>
  <ResourceHolder />
  <LinkTo @route="project">Go to project &rarr;</LinkTo>
</template>
