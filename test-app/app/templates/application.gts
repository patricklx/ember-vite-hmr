import { pageTitle } from 'ember-page-title';
import { LinkTo } from '@ember/routing';

<template>
  {{pageTitle "EmberViteHmrRepro"}}

  {{! Repro steps: Equipment -> Project -> Equipment.
      The assertion fires on the SECOND visit to Equipment. }}
  <nav>
    <LinkTo @route="index" class="nav-index">Home</LinkTo>
    |
    <LinkTo @route="equipment" class="nav-equipment">Equipment</LinkTo>
    |
    <LinkTo @route="project" class="nav-project">Project</LinkTo>
  </nav>

  <hr />

  {{outlet}}
</template>
