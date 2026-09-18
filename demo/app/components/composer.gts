import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';

interface Signature {
  Args: {
    isResponding: boolean;
    onSend: (text: string) => void;
  };
}

export default class Composer extends Component<Signature> {
  @tracked draft = '';

  updateDraft = (event: Event) => {
    this.draft = (event.target as HTMLInputElement).value;
  };

  submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!this.draft.trim() || this.args.isResponding) {
      return;
    }
    this.args.onSend(this.draft);
    this.draft = '';
  };

  <template>
    <form class="composer" {{on "submit" this.submit}}>
      <label for="composer-input" class="visually-hidden">Message</label>
      <input
        id="composer-input"
        type="text"
        class="composer__input"
        placeholder="Ask the mocked assistant…"
        value={{this.draft}}
        disabled={{@isResponding}}
        {{on "input" this.updateDraft}}
      />
      <button
        type="submit"
        class="composer__send"
        disabled={{@isResponding}}
      >{{if @isResponding "…" "Send"}}</button>
    </form>
  </template>
}
