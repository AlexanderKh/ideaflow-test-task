import React, {useRef, useState} from "react";
import "./App.css";
import {CompositeDecorator, Editor, EditorCommand, EditorState, getDefaultKeyBinding, Modifier,} from 'draft-js';
import 'draft-js/dist/Draft.css';

const acTrigger = '<>'
const acSuggestions = [
  "getSelection",
  "getAnchorKey",
  "getEntityAt",
  "getAnchorOffset",
  "getText",
  "getBoundingClientRect",
  "getLastCreatedEntityKey",
  "findEntityRanges",
]
const MAX_SUGGESTIONS = 4;
function getSuggestions(matchText: string) {
  if (matchText.length < 1) {
    return [];
  }

  let selectedSuggestions = acSuggestions.filter((x) => x.startsWith(matchText));
  if (selectedSuggestions.length > MAX_SUGGESTIONS) {
    selectedSuggestions = selectedSuggestions.slice(0, MAX_SUGGESTIONS);
  }
  return selectedSuggestions;
}

type MatchProps = {
  matchTriggerStart: number,
  matchStart: number,
  matchEnd: number,
  matchString: string,
  matchText: string,
}
type CaretPosition = {
  top: number,
  left: number,
}


const decorator = new CompositeDecorator([
  {
    strategy: (contentBlock, callback, contentState) => {
      contentBlock.findEntityRanges((character) => {
        const entityKey = character.getEntity();
        return !!entityKey;
      }, callback);
    },
    component: (props) => <span style={{backgroundColor: "darkred"}}>{props.children}</span>
  }
]);

function App() {
  const [editorState, setEditorState] = React.useState(() => EditorState.createEmpty(decorator));
  const currentlyOnMatchStringRef = useRef(false);
  const currentMatchRef = useRef<MatchProps | null>(null);
  const editorRef = useRef(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<null | number>(null);
  const [caretPosition, setCaretPosition] = useState<null | CaretPosition>(null);

  const updateCaretPosition = () => {
    const textSelection = getSelection()
    if (textSelection && textSelection.anchorNode) {
      const boundingClientRect = textSelection.getRangeAt(0).getBoundingClientRect();
      setCaretPosition({top: boundingClientRect.bottom, left: boundingClientRect.left});
    } else {
      setCaretPosition(null);
    }
  }

  const updateSuggestions = () => {
    if (currentMatchRef.current) {
      const newSuggestions = getSuggestions(currentMatchRef.current.matchText);
      setSuggestions(newSuggestions);
      setSelectedSuggestion(newSuggestions.length > 0 ? 0 : null);
    } else {
      setSuggestions([])
      setSelectedSuggestion(null);
    }
  }

  const updateMatchString = (s: EditorState) => {
    const selectionState = s.getSelection();
    const currentBlockKey = selectionState.getAnchorKey()
    const currentBlock = s.getCurrentContent().getBlockForKey(currentBlockKey);
    const currentBlockText = currentBlock.getText();

    const anchorOffset = selectionState.getAnchorOffset();

    let cursor = anchorOffset - 1;
    let matchString = '';
    let hasMatch = false;
    while (cursor >= 0) {
      if (currentBlock.getEntityAt(cursor) !== null) {
        break;
      }
      matchString = currentBlockText[cursor] + matchString;
      if (matchString.length >= acTrigger.length && matchString.slice(0, acTrigger.length) === acTrigger) {
        hasMatch = true;
        break;
      }
      cursor--;
    }

    currentlyOnMatchStringRef.current = hasMatch;

    if (!hasMatch) {
      currentMatchRef.current = null
    } else {
      currentMatchRef.current = {
        matchTriggerStart: cursor,
        matchStart: cursor + acTrigger.length,
        matchEnd: anchorOffset,
        matchString: matchString,
        matchText: matchString.slice(acTrigger.length)
      };
    }
  }

  const handleChange = (s: EditorState) => {
    setEditorState(s);

    updateMatchString(s);
    updateCaretPosition();
    updateSuggestions();
  }

  const doAutocomplete = () => {
    if (!currentMatchRef.current) {
      return;
    }

    const newText = selectedSuggestion !== null ? suggestions[selectedSuggestion] : currentMatchRef.current.matchText;

    const selectionState = editorState.getSelection();
    const currentBlockKey = selectionState.getAnchorKey();

    const currentContentState = editorState.getCurrentContent();

    let newContentState = currentContentState.createEntity("TOKEN", "IMMUTABLE");
    const entityKey = newContentState.getLastCreatedEntityKey();
    const rangeToReplace = selectionState.merge({
      anchorKey: currentBlockKey,
      anchorOffset: currentMatchRef.current.matchTriggerStart,
      focusKey: currentBlockKey,
      focusOffset: currentMatchRef.current.matchEnd,
    });
    newContentState = Modifier.replaceText(newContentState, rangeToReplace, newText, undefined, entityKey)

    const newEditorStateWithEntity = EditorState.push(
      editorState,
      newContentState,
      'change-block-data'
    );
    const newEditorState = EditorState.moveFocusToEnd(newEditorStateWithEntity);

    handleChange(newEditorState);
  }

  const handleKeyCommand = (command: EditorCommand) => {
    if (command === 'autocomplete') {
      doAutocomplete();
      return 'handled';
    }
    if (command === 'prev-suggestion' && selectedSuggestion !== null) {
      setSelectedSuggestion(Math.max(selectedSuggestion - 1, 0))
      return 'handled';
    }
    if (command === 'next-suggestion' && selectedSuggestion !== null) {
      setSelectedSuggestion(Math.min(selectedSuggestion + 1, suggestions.length - 1))
      return 'handled';
    }
    return 'not-handled';
  }

  const keyBindingFn = (e: React.KeyboardEvent<{}>) => {
    if (['Tab', 'Enter'].includes(e.key) && currentlyOnMatchStringRef.current) {
      return 'autocomplete'
    }
    if (e.key === 'ArrowUp' && selectedSuggestion !== null) {
      return 'prev-suggestion'
    }
    if (e.key === 'ArrowDown' && selectedSuggestion !== null) {
      return 'next-suggestion'
    }
    return getDefaultKeyBinding(e);
  }

  const renderACBox = () => {
    if (suggestions.length === 0 || selectedSuggestion === null || !caretPosition) {
      return null;
    }

    return <div style={{
      position: "fixed",
      border: "1px solid white",
      top: caretPosition.top,
      left: caretPosition.left,
      width: "120px",
      maxHeight: "100px",
      overflow: "hidden",
      zIndex: 10
    }}>
      <ol className='suggestions-list'>
        {suggestions.map((s, i) => {
          const color = i === selectedSuggestion ? "red" : "white";
          return <li style={{borderBottom: `1px dashed ${color}`, color: color}}>{s}</li>
        })}
      </ol>
    </div>
  }

  return <div className="app">
    <p>
      All Possible Suggestions: {acSuggestions.join(', ')}
    </p>
    <div className="editor-wrap">
      <Editor
        editorState={editorState}
        onChange={handleChange}
        handleKeyCommand={handleKeyCommand}
        keyBindingFn={keyBindingFn}
        ref={editorRef}
      />
      {renderACBox()}
    </div>
  </div>
}

export default App;
