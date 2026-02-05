Reflection (required)

In 5 bullets, include:



•Where AI saved time.

It saved time in creating skeleton code for the basics like html and even css. Having said that, looking at that code felt like I was looking at someone else’s code and thus less instinctive for me to troubleshoot. Whereas, if I create the code myself, I become fully acquainted with the code therefore feel much more confident in knowing where to look if and when a bug arises.



•At least one AI bug you identified and how you fixed it.

For Part 2 the Sidebar would NOT update with or without reload. It turns out there was mismatch in a huge number of class names between the html and css code that the AI model had created. These differences were highlighted by the AI model itself and all I had to do was address them by matching up the class names between the 2 files.



•A code snippet you refactored for clarity.

This did not make sense to me no matter how I looked at it and it was simple enough to try to refactor it.  It wasn’t only after I spent some time with it and trying things in another sand box that I was finally able to make sense of it and refactor it:

From:  

//function escapeHtml(str){ return String(str).replace(/\[\&<>"']/g, s=>({ '\&':'\&amp;','<':'\&lt;','>':'\&gt;','"':'\&quot;',"'":'\&#39;' })\[s]); }

To: 

&nbsp;       function escapeHtml(str) {

&nbsp;           const map = {

&nbsp;               '\&': '\&amp;',

&nbsp;               '<': '\&lt;',

&nbsp;               '>': '\&gt;',

&nbsp;               '"': '\&quot;',

&nbsp;               "'": '\&#39;'

&nbsp;                };

&nbsp;           return String(str).replace(/\[\&<>"']/g, char => map\[char]);

&nbsp;           }



•One accessibility improvement you added.

added visible focus indicators for all interactive elements including buttons and links: 

/\* Utility \*/

button{cursor:pointer}

/\*:focus{outline:none}

:focus-visible{outline:3px solid rgba(37,99,235,0.18);outline-offset:2px}\*/



button:focus, a:focus, .sidebar li:focus {

&nbsp; outline: 3px solid var(--accent);

&nbsp; outline-offset: 2px;

}



•What prompt changes improved AI output.

From 

&nbsp;   “Create a minimal HTML skeleton for a Flashcards app with header, sidebar for decks, main area for cards, and a footer.”

To

“Create a semantic HTML skeleton for a Flashcards app with <header>, <aside> for decks, <main> for cards, and <footer>. Ensure basic accessibility landmarks are present.”



...All others appear to have given good enough output…scary 😊



