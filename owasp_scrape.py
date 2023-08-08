#!/usr/bin/env python3
import requests
from bs4 import BeautifulSoup
import csv

# The URL of the OWASP Glossary
url = "https://cheatsheetseries.owasp.org/glossary.html"

# Send a GET request to the webpage
response = requests.get(url)

# Parse the HTML content of the page with BeautifulSoup
soup = BeautifulSoup(response.content, "html.parser")

# Open our CSV file and create a writer object
with open("owasp_terms.csv", "w", newline="") as csvfile:
    writer = csv.writer(csvfile)
    writer.writerow(["Term", "Definition"])

    # For each section in the page
    for section in soup.find_all("div", {"class": "section"}):
        # The term is the text of the first header in the section
        term = section.find("h1").get_text(strip=True)

        # The definition is the text of the following paragraph
        definition = section.find("p").get_text(strip=True)

        # Write the term and definition to our CSV file
        writer.writerow([term, definition])
