document.addEventListener("DOMContentLoaded", () => {
  const suggestionForm = document.getElementById("suggestion-form");
  const suggestionTermInput = document.getElementById("suggestion-term-input");
  const suggestionDefinitionInput = document.getElementById(
    "suggestion-definition-input"
  );
  const termList = document.getElementById("term-list");
  const checkbox = document.getElementById("checkbox");

  // Apply the initial theme based on user's system preference
  const darkModeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const darkModeOn = darkModeMediaQuery.matches;
  document.body.classList.toggle("dark", darkModeOn);

  checkbox.checked = darkModeOn;
  checkbox.addEventListener("change", (event) => {
    document.body.classList.toggle("dark", event.target.checked);
  });

  // Set the initial theme of the site
  document.body.classList.toggle("dark", darkModeOn);

  checkbox.addEventListener("change", (event) => {
    document.body.classList.toggle("dark", event.target.checked);
  });

  suggestionForm.addEventListener("submit", addSuggestion);

  function addSuggestion(e) {
    e.preventDefault();
    const term = suggestionTermInput.value;
    const definition = suggestionDefinitionInput.value;

    fetch("/suggestions/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ term, definition }),
    })
      .then((response) => response.json())
      .then((data) => {
        suggestionTermInput.value = "";
        suggestionDefinitionInput.value = "";
      })
      .catch((error) => {
        console.error("Error:", error);
      });
  }

  // Define getTerms function
  function getTerms() {
    fetch("/terms")
      .then((response) => response.json())
      .then((data) => {
        let output = "<h2>List of Terms</h2>";
        output += "<ul>";
        data.forEach(function (term) {
          output += `
          <li>
            <strong>${term.term}</strong>: ${term.definition}
          </li>
        `;
        });
        output += "</ul>";
        document.getElementById("response").innerHTML = output;
      })
      .catch((error) => console.error("Error fetching terms:", error));
  }

  // Define filterByLetter function
  window.filterByLetter = function filterByLetter(event, letter) {
    event.preventDefault(); // Prevent the <a> tag from causing the page to jump

    // Make an HTTP GET request to our new API endpoint
    fetch("/terms/starts-with/" + letter)
      .then((response) => response.json())
      .then((data) => {
        // Get the term list element
        const termList = document.getElementById("term-list");

        // Clear any existing terms
        termList.innerHTML = "";

        // Loop through each term in the response data and add it to the term list
        data.forEach((term) => {
          termList.innerHTML +=
            "<p><strong>" +
            term.term +
            "</strong>: " +
            term.definition +
            "</p>";
        });
      })
      .catch((error) => console.error("Error:", error));
  };

  // Add event listener to clear-filter button
  document
    .getElementById("clear-filter")
    .addEventListener("click", function (event) {
      // Prevent the default action
      event.preventDefault();

      // Call the getTerms function
      getTerms();
    });

  document
    .getElementById("search-form")
    .addEventListener("submit", function (event) {
      // Prevent the form from submitting the normal way
      event.preventDefault();

      // Get the search query from the input field
      var searchQuery = document.getElementById("search-input").value;

      if (searchQuery === "") {
        // If the search query is empty, reset the term list
        getTerms();
      } else {
        // Make an HTTP GET request to our search API endpoint
        fetch("/terms/search/" + searchQuery)
          .then((response) => response.json())
          .then((data) => {
            // Get the term list element
            const termList = document.getElementById("term-list");

            // Clear any existing terms
            termList.innerHTML = "";

            // Loop through each term in the response data and add it to the term list
            data.forEach((term) => {
              // Create a new term element
              let termElement = document.createElement("p");
              termElement.innerHTML =
                "<strong>" + term.term + "</strong>: " + term.definition;

              // Add necessary classes to the term element
              termElement.classList.add("your-class-for-hover-effect");

              // Append the term element to the term list
              termList.appendChild(termElement);
            });
          })
          .catch((error) => console.error("Error:", error));
      }
    });

  window.switchFilter = function switchFilter(filterType) {
    var alphabetFilter = document.getElementById("alphabet-filter");
    var categoryFilter = document.getElementById("category-filter");

    if (filterType === "alphabet") {
      alphabetFilter.style.display = "block";
      categoryFilter.style.display = "none";
    } else if (filterType === "category") {
      alphabetFilter.style.display = "none";
      categoryFilter.style.display = "block";
    }
  };

  getCategories = function () {
    fetch("/terms/categories")
      .then((response) => response.json())
      .then((data) => {
        const categoryFilter = document.getElementById("category-filter");
        categoryFilter.innerHTML = "";
        data.forEach((category) => {
          var categoryLink = document.createElement("a");
          categoryLink.href = "#";
          categoryLink.onclick = function (event) {
            event.preventDefault();
            filterByCategory(category._id);
          };
          categoryLink.textContent = category._id + " (" + category.count + ")";
          categoryFilter.appendChild(categoryLink);
        });
      })
      .catch((error) => console.error("Error:", error));
  };

  filterByCategory = function (category) {
    fetch("/terms/category/" + category)
      .then((response) => response.json())
      .then((data) => {
        const termList = document.getElementById("term-list");
        termList.innerHTML = "";
        data.forEach((term) => {
          termList.innerHTML +=
            "<p><strong>" +
            term.term +
            "</strong>: " +
            term.definition +
            "</p>";
        });
      })
      .catch((error) => console.error("Error:", error));
  };

  // Call getTerms function to populate term list on page load
  getTerms();
  getCategories();
});
