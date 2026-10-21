import { useRef, useState } from "react";

const products = [
  { name: "Pocket notebook", category: "Stationery", price: 6 },
  { name: "Desk planner", category: "Stationery", price: 12 },
  { name: "Travel mug", category: "Home", price: 18 },
  { name: "Reading lamp", category: "Home", price: 32 },
];

function ProfileForm() {
  const [profile, setProfile] = useState(null);

  function saveProfile(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setProfile(Object.fromEntries(data));
  }

  return (
    <section className="card" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Your profile</h2>
      <form aria-label="Profile" onSubmit={saveProfile}>
        <p>All profile fields are required.</p>
        <label htmlFor="full-name">Full name</label>
        <input id="full-name" name="name" autoComplete="name" required />
        <label htmlFor="email">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="bio">Short biography</label>
        <textarea id="bio" name="bio" rows="3" maxLength="250" required />
        <button type="submit">Save profile</button>
      </form>
      <div role="status">
        {profile && (
          <div className="result">
            <h3>Saved profile</h3>
            <dl>
              <dt>Name</dt><dd>{profile.name}</dd>
              <dt>Email</dt><dd>{profile.email}</dd>
              <dt>Biography</dt><dd>{profile.bio}</dd>
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}

function PreferencesForm() {
  const [delivery, setDelivery] = useState("Weekly");
  const [volume, setVolume] = useState("40");
  const [saved, setSaved] = useState("");

  function savePreferences(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const topics = data.getAll("topics");
    setSaved(
      `Preferences saved. Language: ${data.get("language")}. Updates: ${delivery}. ` +
      `Topics: ${topics.length ? topics.join(", ") : "none"}. ` +
      `Volume: ${volume}%. Notifications: ${data.has("notifications") ? "on" : "off"}.`,
    );
  }

  return (
    <section className="card" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading">Preferences</h2>
      <form aria-label="Preferences" onSubmit={savePreferences}>
        <label htmlFor="language">Language</label>
        <select id="language" name="language" defaultValue="English">
          <option>English</option><option>Spanish</option><option>French</option>
        </select>
        <fieldset>
          <legend>Email frequency</legend>
          {["Daily", "Weekly", "Never"].map((value) => (
            <label className="choice" key={value}>
              <input type="radio" name="delivery" value={value}
                checked={delivery === value} onChange={() => setDelivery(value)} />
              {value}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Topics of interest</legend>
          {["Technology", "Travel", "Cooking"].map((topic) => (
            <label className="choice" key={topic}>
              <input type="checkbox" name="topics" value={topic} />{topic}
            </label>
          ))}
        </fieldset>
        <label className="choice">
          <input type="checkbox" name="notifications" defaultChecked />
          Enable notifications
        </label>
        <label htmlFor="volume">Notification volume: {volume}%</label>
        <input id="volume" type="range" min="0" max="100" step="10"
          value={volume} onChange={(event) => setVolume(event.target.value)}
          aria-valuetext={`${volume} percent`} />
        <button type="submit">Save preferences</button>
      </form>
      <p role="status">{saved}</p>
    </section>
  );
}

function BookingForm() {
  const [mode, setMode] = useState("Online");
  const [confirmation, setConfirmation] = useState("");

  function book(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setConfirmation(
      `Booking confirmed: ${data.get("session")} on ${data.get("date")} at ${data.get("time")} ` +
      `for ${data.get("guests")} guest(s). ${mode}` +
      (mode === "In person" ? ` at ${data.get("location")}.` : "."),
    );
  }

  return (
    <section className="card" aria-labelledby="booking-heading">
      <h2 id="booking-heading">Book a workshop</h2>
      <form aria-label="Workshop booking" onSubmit={book}>
        <p>All displayed fields and the agreement are required.</p>
        <label htmlFor="session">Workshop</label>
        <select id="session" name="session" required defaultValue="">
          <option value="" disabled>Choose a workshop</option>
          <option>Accessible design</option><option>React basics</option><option>Testing with bots</option>
        </select>
        <label htmlFor="date">Workshop date</label>
        <input id="date" name="date" type="date" required />
        <label htmlFor="time">Start time</label>
        <input id="time" name="time" type="time" required />
        <label htmlFor="guests">Number of guests</label>
        <input id="guests" name="guests" type="number" min="1" max="6"
          defaultValue="1" aria-describedby="guests-hint" required />
        <p id="guests-hint" className="hint">Choose between 1 and 6 guests.</p>
        <label htmlFor="mode">Attendance</label>
        <select id="mode" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option>Online</option><option>In person</option>
        </select>
        {mode === "In person" && (
          <>
            <label htmlFor="location">Location</label>
            <select id="location" name="location" defaultValue="North studio" required>
              <option>North studio</option><option>South studio</option>
            </select>
          </>
        )}
        <label className="choice">
          <input type="checkbox" required />I agree to the workshop terms
        </label>
        <button type="submit">Book workshop</button>
      </form>
      <p role="status">{confirmation}</p>
    </section>
  );
}

function Shop() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [sort, setSort] = useState("Name");
  const [cart, setCart] = useState({});
  const [message, setMessage] = useState("");
  const cartHeading = useRef(null);
  const visible = products
    .filter((product) => (category === "All" || product.category === category) &&
      product.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => sort === "Price: low to high" ? a.price - b.price : a.name.localeCompare(b.name));
  const total = products.reduce((sum, product) => sum + product.price * (cart[product.name] || 0), 0);
  const itemCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

  function add(product) {
    setCart((current) => ({ ...current, [product.name]: (current[product.name] || 0) + 1 }));
    setMessage(`${product.name} added to cart.`);
  }

  function remove(product) {
    if (cart[product.name] === 1) cartHeading.current.focus();
    setCart((current) => ({ ...current, [product.name]: current[product.name] - 1 }));
    setMessage(`One ${product.name} removed from cart.`);
  }

  return (
    <section className="card wide" id="shop" aria-labelledby="shop-heading">
      <h2 id="shop-heading">Small shop</h2>
      <div className="filters" role="search" aria-label="Product filters">
        <div>
          <label htmlFor="search">Search products</label>
          <input id="search" type="search" value={query}
            onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div>
          <label htmlFor="category">Product category</label>
          <select id="category" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option>All</option><option>Stationery</option><option>Home</option>
          </select>
        </div>
        <div>
          <label htmlFor="sort">Sort products</label>
          <select id="sort" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option>Name</option><option>Price: low to high</option>
          </select>
        </div>
      </div>
      <p role="status">{visible.length} products found.</p>
      <ul className="products" aria-label="Products">
        {visible.map((product) => (
          <li key={product.name}>
            <h3>{product.name}</h3>
            <p>{product.category} / ${product.price}</p>
            <button onClick={() => add(product)}>Add {product.name} to cart</button>
          </li>
        ))}
      </ul>
      {visible.length === 0 && <p>No matching products. Try a different search or category.</p>}
      <section aria-labelledby="cart-heading">
        <h3 id="cart-heading" ref={cartHeading} tabIndex="-1">Shopping cart</h3>
        {itemCount === 0 ? <p>Your cart is empty.</p> : (
          <ul>
            {products.filter((product) => cart[product.name] > 0).map((product) => (
              <li className="cart-item" key={product.name}>
                <span>{product.name}: quantity {cart[product.name]}</span>
                <button onClick={() => remove(product)}>Remove one {product.name}</button>
              </li>
            ))}
          </ul>
        )}
        <p aria-live="polite" aria-atomic="true">Cart total: ${total}. Items: {itemCount}.</p>
        <button disabled={itemCount === 0} onClick={() => {
          cartHeading.current.focus();
          setCart({});
          setMessage("Cart cleared.");
        }}>Clear cart</button>
        <p role="status">{message}</p>
      </section>
    </section>
  );
}

function TaskList() {
  const [tasks, setTasks] = useState([
    { id: 1, title: "Read the help page", done: false },
    { id: 2, title: "Try the shop", done: false },
  ]);
  const nextId = useRef(3);
  const [message, setMessage] = useState("");

  function addTask(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = new FormData(form).get("task").trim();
    if (!title) {
      setMessage("Enter a task name containing at least one non-space character.");
      form.elements.task.focus();
      return;
    }
    const task = { id: nextId.current++, title, done: false };
    setTasks((current) => [...current, task]);
    setMessage(`Task added: ${title}.`);
    form.reset();
    form.elements.task.focus();
  }

  return (
    <section className="card" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Task checklist</h2>
      <form aria-label="Add a task" onSubmit={addTask}>
        <label htmlFor="task">New task</label>
        <input id="task" name="task" required maxLength="80" />
        <button type="submit">Add task</button>
      </form>
      <ul className="task-list" aria-label="Tasks">
        {tasks.map((task) => (
          <li key={task.id}>
            <label className="choice">
              <input type="checkbox" checked={task.done}
                onChange={() => setTasks((current) => current.map((item) =>
                  item.id === task.id ? { ...item, done: !item.done } : item))} />
              {task.title}
            </label>
          </li>
        ))}
      </ul>
      <p aria-live="polite">{tasks.filter((task) => task.done).length} of {tasks.length} tasks complete.</p>
      <p role="status">{message}</p>
    </section>
  );
}

function Controls() {
  const [count, setCount] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const [message, setMessage] = useState("");
  const dialog = useRef(null);

  return (
    <section className="card" aria-labelledby="controls-heading">
      <h2 id="controls-heading">Buttons and dialogs</h2>
      <p aria-live="polite">Counter value: {count}.</p>
      <div className="actions">
        <button onClick={() => setCount((value) => value + 1)}>Increase counter</button>
        <button disabled={count === 0} onClick={() => setCount((value) => value - 1)}>Decrease counter</button>
        <button onClick={() => setCount(0)}>Reset counter</button>
        <button aria-pressed={favorite} onClick={() => setFavorite((value) => !value)}>Favorite this playground</button>
        <button onClick={() => dialog.current.showModal()}>Reset playground controls</button>
      </div>
      <p role="status">{message}</p>
      <dialog ref={dialog} aria-labelledby="reset-title" aria-describedby="reset-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dialog.current.close();
          }
        }}>
        <h3 id="reset-title">Reset controls?</h3>
        <p id="reset-description">This resets the counter and favorite button only. Forms and cart will not change.</p>
        <form method="dialog" className="actions">
          <button autoFocus>Cancel reset</button>
          <button onClick={() => {
            setCount(0);
            setFavorite(false);
            setMessage("Counter and favorite reset.");
          }}>Confirm reset</button>
        </form>
      </dialog>
    </section>
  );
}

function HelpPage() {
  const [ticket, setTicket] = useState("");

  function sendRequest(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setTicket(`Support request received. Topic: ${data.get("topic")}. Reply to: ${data.get("reply")}. Message: ${data.get("message")}`);
  }

  return (
    <>
      <h1>Help and support</h1>
      <p>This is a separate page. Use the Playground link to return.</p>
      <div className="grid">
        <section className="card" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Frequently asked questions</h2>
          <details>
            <summary>Where do my changes go?</summary>
            <p>Changes stay in memory on the current page. Reloading or navigating to another page resets them. Nothing is sent to a server.</p>
          </details>
          <details>
            <summary>What is the workshop cancellation code?</summary>
            <p>The workshop cancellation code is MAPLE-42.</p>
          </details>
          <details>
            <summary>Can I use the keyboard?</summary>
            <p>Yes. Use Tab to move between controls, Enter to activate links and buttons, Space to toggle checkboxes, and arrow keys for radio groups and sliders.</p>
          </details>
          <p><a href="./index.html#shop">Return directly to the shop</a></p>
        </section>
        <section className="card" aria-labelledby="support-heading">
          <h2 id="support-heading">Contact support</h2>
          <form aria-label="Support request" onSubmit={sendRequest}>
            <p>All support fields are required. This is a local simulation.</p>
            <label htmlFor="topic">Support topic</label>
            <select id="topic" name="topic" defaultValue="Booking">
              <option>Booking</option><option>Shopping</option><option>Accessibility</option>
            </select>
            <label htmlFor="reply">Reply email</label>
            <input id="reply" name="reply" type="email" required autoComplete="email" />
            <label htmlFor="support-message">Support message</label>
            <textarea id="support-message" name="message" required rows="4" />
            <button type="submit">Send support request</button>
          </form>
          <p role="status">{ticket}</p>
        </section>
      </div>
    </>
  );
}

export default function App() {
  const isHelp = window.location.pathname.endsWith("/help.html");

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header>
        <p className="brand">Accessibility playground</p>
        <nav aria-label="Main navigation">
          <a href="./index.html" aria-current={!isHelp ? "page" : undefined}>Playground</a>
          <a href="./help.html" aria-current={isHelp ? "page" : undefined}>Help and support</a>
          <a href="./bot-tasks.txt" download>Download bot tasks</a>
        </nav>
      </header>
      <main id="main" tabIndex="-1">
        {isHelp ? <HelpPage /> : (
          <>
            <h1>Try a little of everything</h1>
            <p className="intro">Practice forms, filters, shopping, dialogs, and navigation. Every control has a visible label and real local behavior.</p>
            <p className="notice">Use fictional information. Nothing is submitted to a server. Changes reset on reload or when navigating to the help page.</p>
            <nav aria-label="On this page">
              <a href="#profile-heading">Profile</a>
              <a href="#preferences-heading">Preferences</a>
              <a href="#booking-heading">Workshop</a>
              <a href="#shop">Shop</a>
              <a href="#tasks-heading">Checklist</a>
              <a href="#controls-heading">Buttons and dialogs</a>
            </nav>
            <div className="grid">
              <ProfileForm />
              <PreferencesForm />
              <BookingForm />
              <TaskList />
              <Shop />
              <Controls />
            </div>
          </>
        )}
      </main>
      <footer><p>Local-only test site. <a href="#main">Back to main content</a></p></footer>
    </>
  );
}
