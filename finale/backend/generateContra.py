def generate_contradictory(text):
    tokens = word_tokenize(text)
    contradictory_tokens = []

    for token in tokens:
        antonyms = []
        for syn in wordnet.synsets(token):
            for lemma in syn.lemmas():
                if lemma.antonyms():
                    antonyms.append(lemma.antonyms()[0].name())

        if antonyms:
            contradictory_tokens.append(antonyms[0])  # pick first antonym
        else:
            contradictory_tokens.append(token)

    return " ".join(contradictory_tokens)