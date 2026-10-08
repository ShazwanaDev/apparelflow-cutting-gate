import { createDatabase } from './db.js';
import { createApp } from './app.js';

const db = createDatabase();
const port = Number(process.env.PORT || 3000);
createApp(db).listen(port, () => console.log(`ApparelFlow API listening on http://localhost:${port}`));
