require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper function to shuffle an array randomly
function shuffleArray(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

async function fixAndShuffleAnswers() {
  try {
    console.log('Connecting to Supabase to fetch questions...');
    const result = await pool.query('SELECT * FROM questions');
    const questions = result.rows;
    console.log(`Found ${questions.length} questions. Randomizing option positions...`);

    for (const q of questions) {
      // Find which option currently holds the correct answer
      let correctText = q.option_a; // Since all were saved as A

      let options = [
        { text: q.option_a, isCorrect: true },
        { text: q.option_b, isCorrect: false },
        { text: q.option_c, isCorrect: false },
        { text: q.option_d, isCorrect: false }
      ];

      // Randomly shuffle the order of A, B, C, D
      options = shuffleArray(options);

      // Assign new shuffled text
      let newA = options[0].text;
      let newB = options[1].text;
      let newC = options[2].text;
      let newD = options[3].text;

      // Find which letter ('A', 'B', 'C', or 'D') the correct answer landed on after shuffling
      let newCorrectKey = 'A';
      if (options[0].isCorrect) newCorrectKey = 'A';
      else if (options[1].isCorrect) newCorrectKey = 'B';
      else if (options[2].isCorrect) newCorrectKey = 'C';
      else if (options[3].isCorrect) newCorrectKey = 'D';

      // Update the question row in Supabase with shuffled options and correct key
      await pool.query(
        `UPDATE questions SET option_a = $1, option_b = $2, option_c = $3, option_d = $4, correct_answer = $5 WHERE id = $6`,
        [newA, newB, newC, newD, newCorrectKey, q.id]
      );
    }

    console.log('Successfully shuffled all options and corrected answer keys across the database!');
    process.exit(0);
  } catch (err) {
    console.error('Error shuffling answers:', err);
    process.exit(1);
  }
}

fixAndShuffleAnswers();