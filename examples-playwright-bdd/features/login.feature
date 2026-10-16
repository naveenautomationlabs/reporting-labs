@feature:auth @owner:asha
Feature: Login

  Background:
    Given I open the login page

  @smoke @P1
  Scenario: Sign in with a valid user
    When I sign in as "asha" with password "Asha-Pass-01"
    Then I see the message "Welcome asha"

  @critical @story:SHOP-7
  Scenario: A wrong password shows an error
    When I sign in as "asha" with password "Wrong-Pass-9"
    Then I see an error banner
    And I stay on the login page

  Scenario Outline: Sign in as <user>
    When I sign in as "<user>" with password "<password>"
    Then I see the message "<message>"

    Examples:
      | user  | password      | message      |
      | ravi  | Ravi-Pass-02  | Welcome ravi |
      | meera | Meera-Pass-03 | Hello meera  |
