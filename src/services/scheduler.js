import * as fsrsJs from 'fsrs.js';

// FSRS v4 implementation wrappers
export const Rating = fsrsJs.Rating;
export const State = fsrsJs.State;

const f = new fsrsJs.FSRS();

export const createCardFromDb = (dbCard) => {
    const card = new fsrsJs.Card();
    card.due = new Date(dbCard.due);
    card.stability = dbCard.stability;
    card.difficulty = dbCard.difficulty;
    card.elapsed_days = dbCard.elapsed_days;
    card.scheduled_days = dbCard.scheduled_days;
    card.reps = dbCard.reps;
    card.lapses = dbCard.lapses;
    card.state = dbCard.state;
    if (dbCard.last_review) {
        card.last_review = new Date(dbCard.last_review);
    }
    return card;
};

export const nextCardState = (card, rating, now = new Date()) => {
    const scheduling = f.repeat(card, now);
    // scheduling is an object/array accessed by rating enum
    const result = scheduling[rating];
    return {
        card: result.card,
        log: result.review_log
    };
};
